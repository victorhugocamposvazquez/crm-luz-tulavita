/**
 * Rellena `clients.comercializadora = IBERDROLA CLIENTES, S.A.U.` donde falta,
 * usando las mismas reglas que la migración SQL (import Iberdrola o notas de suministro).
 *
 * Útil si no has aplicado aún `20260511140000_backfill_iberdrola_comercializadora.sql`
 * o quieres ejecutar el backfill desde CI/local sin Supabase CLI.
 *
 * Requiere .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso: npm run backfill:iberdrola-comercializadora
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/integrations/supabase/types';
import {
  COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U,
  IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV,
} from '../src/constants/crm-comercializadoras';

function loadDotEnvFile(absPath: string, overrideExisting: boolean): void {
  if (!existsSync(absPath)) return;
  const raw = readFileSync(absPath, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (overrideExisting || process.env[k] === undefined) process.env[k] = v;
  }
}

function loadDotEnvLocal(): void {
  loadDotEnvFile(join(process.cwd(), '.env'), false);
  loadDotEnvFile(join(process.cwd(), '.env.local'), true);
}

async function fetchAllPages<T>(
  run: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await run(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sb = createClient<Database>(url, serviceKey);

  const idSet = new Set<string>();

  const byImport = await fetchAllPages<{ id: string }>((from, to) =>
    sb.from('clients').select('id').eq('import_source', IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV).range(from, to),
  );
  for (const r of byImport) idSet.add(r.id);

  const supplies = await fetchAllPages<{ client_id: string }>((from, to) =>
    sb
      .from('client_supply_addresses')
      .select('client_id')
      .ilike('note', '%iberdrola_operaciones_csv%')
      .range(from, to),
  );
  for (const s of supplies) idSet.add(s.client_id);

  const ids = [...idSet];
  console.log('Clientes candidatos (import o suministro Iberdrola):', ids.length);

  let updated = 0;
  let skipped = 0;
  const BATCH = 80;

  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const { data: rows, error: selErr } = await sb
      .from('clients')
      .select('id, comercializadora')
      .in('id', slice);
    if (selErr) throw new Error(selErr.message);

    for (const row of rows ?? []) {
      const cur = (row.comercializadora ?? '').trim();
      if (cur === COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U) {
        skipped++;
        continue;
      }
      if (cur !== '') {
        skipped++;
        continue;
      }
      const { error: upErr } = await sb
        .from('clients')
        .update({ comercializadora: COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U })
        .eq('id', row.id);
      if (upErr) {
        console.error('Error actualizando', row.id, upErr.message);
        continue;
      }
      updated++;
    }
  }

  console.log(`Hecho: actualizados ${updated}, omitidos (ya tenían valor u otra comercializadora) ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
