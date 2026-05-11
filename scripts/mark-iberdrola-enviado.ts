/**
 * Tras dar de alta las operaciones en el portal Iberdrola, actualiza la nota del suministro en el CRM:
 * sustituye o añade `Enviado Iberdrola: <valor>` (por defecto SI) para cada ID de operación del CSV.
 *
 * CSV: misma cabecera que el export/import (columnas obligatorias: ID).
 *
 * Uso:
 *   npm run mark:iberdrola-enviado -- ./csvs/Iberdrola-operaciones-ejemplo.csv
 *   npm run mark:iberdrola-enviado -- ./csvs/mi.csv --valor SI
 *
 * Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import type { Database } from '../src/integrations/supabase/types';

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

interface CsvRow {
  ID?: string;
  'Enviado Iberdrola'?: string;
  [k: string]: string | undefined;
}

function applyEnviadoNote(note: string, valor: string): string {
  const n = note.replace(/\r\n/g, '\n');
  const v = valor.trim() || 'SI';
  const line = `Enviado Iberdrola: ${v}`;
  if (/Enviado Iberdrola:\s*/im.test(n)) {
    return n.replace(/^Enviado Iberdrola:\s*.*$/im, line);
  }
  const idx = n.search(/\nImportado\s+iberdrola_operaciones_csv/i);
  if (idx !== -1) {
    return n.slice(0, idx) + `\n${line}` + n.slice(idx);
  }
  return `${n.trimEnd()}\n${line}`;
}

async function fetchAllIberdrolaSupplies(sb: ReturnType<typeof createClient<Database>>): Promise<
  Array<{ id: string; note: string | null }>
> {
  const PAGE = 1000;
  const out: Array<{ id: string; note: string | null }> = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await sb
      .from('client_supply_addresses')
      .select('id, note')
      .ilike('note', '%iberdrola_operaciones_csv%')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1);
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
    console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const argv = process.argv.slice(2);
  let defaultValor = 'SI';
  const noValorIdx = argv.findIndex((a) => a === '--valor');
  if (noValorIdx !== -1 && argv[noValorIdx + 1]) {
    defaultValor = argv[noValorIdx + 1]!;
    argv.splice(noValorIdx, 2);
  }

  const csvPath = argv[0];
  if (!csvPath || !existsSync(csvPath)) {
    console.error('Uso: npm run mark:iberdrola-enviado -- <ruta.csv> [--valor SI]');
    process.exit(1);
  }

  const parsed = Papa.parse<CsvRow>(readFileSync(csvPath, 'utf8'), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const targets = new Map<string, string>();
  for (const row of parsed.data) {
    const id = (row.ID ?? '').trim();
    if (!id) continue;
    targets.set(id, defaultValor.trim() || 'SI');
  }

  if (targets.size === 0) {
    console.error('No hay filas con ID en el CSV.');
    process.exit(1);
  }

  const sb = createClient<Database>(url, serviceKey);
  const supplies = await fetchAllIberdrolaSupplies(sb);

  const byOpId = new Map<string, { id: string; note: string }>();
  for (const s of supplies) {
    const note = s.note ?? '';
    const m = note.match(/ID origen\s+(\d+)/);
    if (!m) continue;
    const opId = m[1]!;
    byOpId.set(opId, { id: s.id, note });
  }

  let updated = 0;
  let missing = 0;
  const report: string[] = [];

  for (const [opId, valor] of targets) {
    const row = byOpId.get(opId);
    if (!row) {
      missing++;
      report.push(`ID ${opId}: no encontrado en CRM (nota sin ID origen)`);
      continue;
    }
    const newNote = applyEnviadoNote(row.note, valor);
    if (newNote === row.note) {
      report.push(`ID ${opId}: sin cambios`);
      continue;
    }
    const { error } = await sb.from('client_supply_addresses').update({ note: newNote }).eq('id', row.id);
    if (error) {
      report.push(`ID ${opId}: ERROR ${error.message}`);
      continue;
    }
    updated++;
    report.push(`ID ${opId}: OK → Enviado Iberdrola: ${valor}`);
  }

  console.log(`Actualizados ${updated} suministros. No encontrados: ${missing}.`);
  console.log(report.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
