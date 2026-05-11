/**
 * Exporta operaciones Iberdrola guardadas en el CRM al mismo formato CSV que el import
 * (`scripts/import-iberdrola-operaciones.ts`), para usarlas en el portal Iberdrola.
 *
 * Fuente: filas de `client_supply_addresses` con nota que contiene `iberdrola_operaciones_csv`
 * y la línea `ID origen <número>` (generada por el import).
 *
 * Uso:
 *   npm run export:iberdrola
 *   npm run export:iberdrola -- --solo-pendientes
 *   npm run export:iberdrola -- ./csvs/salida.csv
 *   npm run export:iberdrola -- ./csvs/salida.csv --solo-pendientes
 *
 * Requiere .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
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

const HEADERS = [
  'Fecha',
  'ID',
  'Cliente',
  'Suministro',
  'Tipo',
  'Estado',
  'Oferta',
  'Call center',
  'Agente',
  'Provincia',
  'Teléfono',
  'Tipo de cliente',
  'Notas',
  'Clave',
  'Token',
  'Enviado Iberdrola',
] as const;

function parseNote(note: string): { opId: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let opId = '';
  for (const rawLine of note.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const idM = line.match(/ID origen\s+(\d+)/);
    if (idM) opId = idM[1]!;
    const kv = line.match(/^([^:]+):\s*(.*)$/);
    if (kv) map.set(kv[1]!.trim(), kv[2]!.trim());
  }
  return { opId, map };
}

/** ISO YYYY-MM-DD → DD/MM/YYYY; si ya viene con /, devolver tal cual. */
function fechaToDmy(isoOrRaw: string): string {
  const t = (isoOrRaw ?? '').trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return t;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return t;
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

/** +34 697 903 124 → 697903124 */
function telefonoToCsv(tel: string | null | undefined): string {
  if (!tel) return '';
  const d = String(tel).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('34')) return d.slice(2);
  return d;
}

function formatCliente(nombre: string, dni: string | null): string {
  const n = (nombre ?? '').trim();
  const d = (dni ?? '').trim();
  if (d) return `${n} (${d})`;
  return n;
}

async function fetchAllPages<T>(
  fetchRange: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchRange(offset, offset + PAGE - 1);
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
    console.error(
      'Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY en .env.local',
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const soloPendientes = args.includes('--solo-pendientes');
  const paths = args.filter((a) => !a.startsWith('--'));
  const outPath =
    paths[0] ||
    join(process.cwd(), 'csvs', `iberdrola-export-${new Date().toISOString().slice(0, 10)}.csv`);

  const sb = createClient<Database>(url, serviceKey);

  const supplies = await fetchAllPages<{
    id: string;
    client_id: string;
    cups: string | null;
    note: string | null;
    localidad: string | null;
  }>((from, to) =>
    sb
      .from('client_supply_addresses')
      .select('id, client_id, cups, note, localidad')
      .ilike('note', '%iberdrola_operaciones_csv%')
      .order('id', { ascending: true })
      .range(from, to),
  );

  const clientIds = [...new Set(supplies.map((s) => s.client_id))];
  const clientsById = new Map<
    string,
    { nombre_apellidos: string; dni: string | null; telefono1: string | null }
  >();

  for (let i = 0; i < clientIds.length; i += 500) {
    const slice = clientIds.slice(i, i + 500);
    const { data: clients, error: ce } = await sb
      .from('clients')
      .select('id, nombre_apellidos, dni, telefono1')
      .in('id', slice);
    if (ce) throw new Error(ce.message);
    for (const c of clients ?? []) {
      clientsById.set(c.id, {
        nombre_apellidos: c.nombre_apellidos,
        dni: c.dni,
        telefono1: c.telefono1,
      });
    }
  }

  const rows: Record<string, string>[] = [];

  for (const s of supplies) {
    const note = s.note ?? '';
    const { opId, map } = parseNote(note);
    if (!opId) continue;

    const enviado = (map.get('Enviado Iberdrola') ?? '').trim();
    if (soloPendientes && enviado.toUpperCase() === 'SI') continue;

    const cli = clientsById.get(s.client_id);
    if (!cli) continue;

    const fechaRaw = map.get('Fecha') ?? '';
    rows.push({
      Fecha: fechaToDmy(fechaRaw),
      ID: opId,
      Cliente: formatCliente(cli.nombre_apellidos, cli.dni),
      Suministro: (s.cups ?? '').trim(),
      Tipo: map.get('Tipo') ?? '',
      Estado: map.get('Estado') ?? '',
      Oferta: map.get('Oferta') ?? '',
      'Call center': map.get('Call center') ?? '',
      Agente: map.get('Agente') ?? '',
      Provincia: (s.localidad ?? '').trim(),
      Teléfono: telefonoToCsv(cli.telefono1),
      'Tipo de cliente': map.get('Tipo cliente') ?? '',
      Notas: map.get('Notas') ?? '',
      Clave: map.get('Clave') ?? '',
      Token: map.get('Token') ?? '',
      'Enviado Iberdrola': enviado || 'NO',
    });
  }

  const csv = Papa.unparse(rows, { columns: [...HEADERS], newline: '\n' });
  writeFileSync(outPath, csv, 'utf8');
  console.log(
    `Escrito ${outPath} (${rows.length} filas${soloPendientes ? ', solo pendientes (no marcadas SI)' : ''}).`,
  );
  if (rows.length === 0) {
    console.log(
      'No hay filas exportables (¿notas sin “ID origen”, o todas SI con --solo-pendientes?).',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
