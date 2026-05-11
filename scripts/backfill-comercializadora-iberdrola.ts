/**
 * Rellena `clients.comercializadora = IBERDROLA CLIENTES, S.A.U.` donde falta,
 * detectando Iberdrola por:
 *   - import_source = iberdrola_operaciones_csv
 *   - import_external_key LIKE iberdrola_cli_%
 *   - suministro con note o label que contenga "iberdrola" (ilike)
 *
 * Opciones:
 *   --dry-run     Solo muestra recuentos, no actualiza.
 *   --force       También sobrescribe si ya hay otra comercializadora distinta de Iberdrola (solo candidatos Iberdrola).
 *
 * Requiere .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   npm run backfill:iberdrola-comercializadora
 *   npm run backfill:iberdrola-comercializadora -- --dry-run
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
  const argv = new Set(process.argv.slice(2));
  const dryRun = argv.has('--dry-run');
  const force = argv.has('--force');

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sb = createClient<Database>(url, serviceKey);

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return '(URL inválida)';
    }
  })();

  const [{ count: totalClients }, { count: totalSupplies }] = await Promise.all([
    sb.from('clients').select('*', { count: 'exact', head: true }),
    sb.from('client_supply_addresses').select('*', { count: 'exact', head: true }),
  ]);

  console.log(`Conectado a Supabase: ${host}`);
  console.log(`Total en esta BD — clientes: ${totalClients ?? '?'} | puntos suministro: ${totalSupplies ?? '?'}`);
  if ((totalClients ?? 0) === 0) {
    console.log(
      '\n⚠ Esta base no tiene clientes. Revisa SUPABASE_URL / VITE_SUPABASE_URL en .env.local (¿proyecto equivocado o BD vacía?).',
    );
    process.exit(0);
  }
  if ((totalSupplies ?? 0) === 0) {
    console.log(
      '\n⚠ Hay clientes pero ningún punto de suministro (client_supply_addresses). El import Iberdrola crea CUPS ahí; sin eso el backfill no puede inferir Iberdrola por suministro.',
    );
  }
  console.log('');

  const idSet = new Set<string>();

  const byImport = await fetchAllPages<{ id: string }>((from, to) =>
    sb.from('clients').select('id').eq('import_source', IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV).range(from, to),
  );
  console.log('Por import_source Iberdrola CSV:', byImport.length);
  for (const r of byImport) idSet.add(r.id);

  const byExtKey = await fetchAllPages<{ id: string }>((from, to) =>
    sb.from('clients').select('id').like('import_external_key', 'iberdrola_cli_%').range(from, to),
  );
  console.log('Por import_external_key iberdrola_cli_*:', byExtKey.length);
  for (const r of byExtKey) idSet.add(r.id);

  const suppliesNote = await fetchAllPages<{ client_id: string }>((from, to) =>
    sb
      .from('client_supply_addresses')
      .select('client_id')
      .ilike('note', '%iberdrola%')
      .range(from, to),
  );
  console.log('Suministros con “iberdrola” en note:', suppliesNote.length);

  const suppliesLabel = await fetchAllPages<{ client_id: string }>((from, to) =>
    sb
      .from('client_supply_addresses')
      .select('client_id')
      .ilike('label', '%iberdrola%')
      .range(from, to),
  );
  console.log('Suministros con “iberdrola” en label:', suppliesLabel.length);

  for (const s of suppliesNote) idSet.add(s.client_id);
  for (const s of suppliesLabel) idSet.add(s.client_id);

  const ids = [...idSet];
  console.log('\nClientes candidatos (unión):', ids.length);
  if (ids.length === 0) {
    console.log(
      '\nNo hay coincidencias: los datos no pasaron por import Iberdrola o los suministros no llevan “Iberdrola” en etiqueta/nota. Importa con npm run import:iberdrola o marca la comercializadora a mano en la ficha.',
    );
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n--dry-run: no se ha actualizado nada.');
    process.exit(0);
  }

  let updated = 0;
  let skippedAlready = 0;
  let skippedOther = 0;
  let errors = 0;
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
        skippedAlready++;
        continue;
      }
      if (cur !== '' && !force) {
        skippedOther++;
        continue;
      }
      const { error: upErr } = await sb
        .from('clients')
        .update({ comercializadora: COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U })
        .eq('id', row.id);
      if (upErr) {
        console.error('Error actualizando', row.id, upErr.message);
        errors++;
        continue;
      }
      updated++;
    }
  }

  console.log('\n---');
  console.log(`Actualizados: ${updated}`);
  console.log(`Omitidos (ya Iberdrola CNMC): ${skippedAlready}`);
  console.log(`Omitidos (otra comercializadora rellena; usa --force para sustituir): ${skippedOther}`);
  if (errors) console.log(`Errores: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
