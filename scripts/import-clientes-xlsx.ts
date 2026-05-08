/**
 * Importa clientes desde `csvs/Clientes.xlsx`.
 *
 * Estructura esperada de la hoja (fila 1 = título "Clientes", fila 2 = cabeceras, datos desde fila 3):
 *   ID | CIF | Ficha | Cliente | Grupo | Colectivo | Telefono | Email | Comercial | Administrador | Obs | Direccion | Iban
 *
 * Mapeo al CRM (`public.clients`):
 *   ID         → import_external_key = "clientes_xlsx:<ID>"  (anti re-imports)
 *   CIF        → dni (normalizado a mayúsculas, sin espacios)
 *   Cliente    → nombre_apellidos
 *   Telefono   → telefono1 (formateado +34 si móvil/9 dígitos ES)
 *   Email      → email
 *   Comercial  → assigned_commercial_id (best-effort: busca profile por nombre)
 *   Direccion  → direccion + intento de extraer CP y localidad
 *   Iban       → iban (normalizado: sin espacios, mayúsculas)
 *   Colectivo, Obs, Administrador → se concatenan en `note` con etiquetas claras
 *   Si CIF presente → prospect=false, else prospect=true
 *
 * Deduplicación contra el CRM actual (en este orden, por fila):
 *   1) Si ya existe cliente con import_source='clientes_xlsx' y misma import_external_key → SKIP.
 *   2) Si fila tiene CIF y ya existe cliente con ese DNI → SKIP.
 *   3) Si fila no tiene CIF pero el teléfono normalizado coincide con telefono1/2 de un cliente → SKIP.
 *
 * Requisitos:
 *   - Migración 20260509180000 con import_source / import_external_key / import_batch_id.
 *   - Migración 20260510120000 con clients.iban.
 *   - .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY (service_role).
 *
 * Uso:  npm run import:clientes-xlsx
 *       npm run import:clientes-xlsx -- ./csvs/otro.xlsx
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import type { Database } from '../src/integrations/supabase/types';

const IMPORT_SOURCE = 'clientes_xlsx';

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

function warnIfNotServiceRole(key: string): void {
  try {
    const parts = key.split('.');
    if (parts.length < 2) return;
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    if (payload.role !== 'service_role') {
      console.error(
        '\n❌ El JWT no es service_role (rol:',
        payload.role,
        '). Inserts en clients suelen fallar por RLS. Usa SUPABASE_SERVICE_ROLE_KEY.\n',
      );
    }
  } catch {
    /* ignore */
  }
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

function normalizeKey(s: string): string {
  return stripDiacritics(s).toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizeDni(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return s || null;
}

function normalizePhoneKey(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '';
  const s = typeof raw === 'number' ? String(Math.trunc(raw)) : String(raw);
  const digits = s.replace(/\D/g, '');
  if (digits.length === 9 && /^[679]/.test(digits)) return `34${digits}`;
  if (digits.length === 11 && digits.startsWith('34')) return digits;
  return digits;
}

function formatPhoneDisplay(raw: string | number | null | undefined): string | null {
  const key = normalizePhoneKey(raw);
  if (!key) return null;
  if (key.length === 11 && key.startsWith('34')) {
    return `+${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8)}`;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (typeof raw === 'number') return String(Math.trunc(raw));
  return null;
}

/** Texto de celda con exceljs: aplana richText si lo hay. */
function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const anyV = v as Record<string, unknown>;
    if (typeof anyV.text === 'string') return (anyV.text as string).trim();
    if (Array.isArray(anyV.richText)) {
      return (anyV.richText as { text?: string }[])
        .map((p) => p.text ?? '')
        .join('')
        .trim();
    }
    if (typeof anyV.result === 'string') return (anyV.result as string).trim();
    if (typeof anyV.result === 'number') return String(anyV.result);
    if (typeof (cell as ExcelJS.Cell).text === 'string') return ((cell as ExcelJS.Cell).text || '').trim();
  }
  return '';
}

interface ParsedRow {
  excelRow: number;
  id: string;
  cif: string;
  cliente: string;
  colectivo: string;
  telefono: string;
  email: string;
  comercial: string;
  administrador: string;
  obs: string;
  direccion: string;
  iban: string;
}

interface AddressParts {
  direccion: string;
  localidad: string | null;
  codigo_postal: string | null;
}

/** Intento simple: extraer CP (5 dígitos) y dejar el resto como dirección+localidad. */
function parseAddress(raw: string): AddressParts {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return { direccion: '-', localidad: null, codigo_postal: null };
  const cpMatch = t.match(/\b(\d{5})\b/);
  if (!cpMatch) {
    return { direccion: t, localidad: null, codigo_postal: null };
  }
  const cp = cpMatch[1]!;
  const idx = t.indexOf(cp);
  const before = t.slice(0, idx).replace(/[ ,;-]+$/, '').trim();
  const after = t.slice(idx + 5).replace(/^[ ,;-]+/, '').trim();
  return {
    direccion: before || t,
    localidad: after || null,
    codigo_postal: cp,
  };
}

function buildNote(p: ParsedRow, batchId: string): string {
  const parts: string[] = [];
  if (p.colectivo) parts.push(`Colectivo: ${p.colectivo}`);
  if (p.administrador) parts.push(`Administrador: ${p.administrador}`);
  if (p.obs) parts.push(`Obs: ${p.obs}`);
  parts.push(`Importado ${IMPORT_SOURCE} · ID origen ${p.id} · lote ${batchId}`);
  return parts.join('\n');
}

function normalizeIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.replace(/\s+/g, '').toUpperCase();
  return t || null;
}

function ibanLooksValid(iban: string): boolean {
  return iban.length >= 15 && iban.length <= 34 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban);
}

async function fetchAllPages<T>(
  query: () => {
    range: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>;
  },
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await query().range(offset, offset + PAGE - 1);
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
      'Faltan variables en .env.local (o .env):\n  SUPABASE_URL (o VITE_SUPABASE_URL)\n  SUPABASE_SERVICE_ROLE_KEY  ← clave service_role',
    );
    process.exit(1);
  }
  warnIfNotServiceRole(serviceKey);

  const xlsxPath = process.argv[2] || join(process.cwd(), 'csvs', 'Clientes.xlsx');
  if (!existsSync(xlsxPath)) {
    console.error('No existe el fichero:', xlsxPath);
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const sheetName = process.env.CLIENTES_XLSX_SHEET || wb.worksheets[0]?.name || 'Sheet1';
  const ws = wb.getWorksheet(sheetName);
  if (!ws) {
    console.error('Hoja no encontrada:', sheetName, '| disponibles:', wb.worksheets.map((w) => w.name).join(', '));
    process.exit(1);
  }

  // Cabecera en fila 2 (la 1 es el título "Clientes").
  const headerRowIdx = 2;
  const headerRow = ws.getRow(headerRowIdx);
  const colByHeader: Record<string, number> = {};
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    const key = cellText(cell).toLowerCase();
    if (key) colByHeader[key] = col;
  });

  const required = ['id', 'cliente', 'telefono', 'email', 'direccion'];
  const missing = required.filter((h) => !(h in colByHeader));
  if (missing.length) {
    console.error(
      'Cabecera inesperada en fila', headerRowIdx, '. Faltan columnas:', missing.join(', '),
      '\nCabeceras detectadas:', Object.keys(colByHeader).join(' | '),
    );
    process.exit(1);
  }

  const colCif = colByHeader['cif'];
  const colColectivo = colByHeader['colectivo'];
  const colComercial = colByHeader['comercial'];
  const colAdministrador = colByHeader['administrador'];
  const colObs = colByHeader['obs'];
  const colIban = colByHeader['iban'];

  const parsed: ParsedRow[] = [];
  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = cellText(row.getCell(colByHeader.id));
    if (!id) continue;
    parsed.push({
      excelRow: r,
      id,
      cif: colCif ? cellText(row.getCell(colCif)) : '',
      cliente: cellText(row.getCell(colByHeader.cliente)),
      colectivo: colColectivo ? cellText(row.getCell(colColectivo)) : '',
      telefono: cellText(row.getCell(colByHeader.telefono)),
      email: cellText(row.getCell(colByHeader.email)).toLowerCase(),
      comercial: colComercial ? cellText(row.getCell(colComercial)) : '',
      administrador: colAdministrador ? cellText(row.getCell(colAdministrador)) : '',
      obs: colObs ? cellText(row.getCell(colObs)) : '',
      direccion: cellText(row.getCell(colByHeader.direccion)),
      iban: colIban ? cellText(row.getCell(colIban)) : '',
    });
  }

  console.log('Filas detectadas:', parsed.length, '(fichero:', xlsxPath, ')');

  const sb = createClient<Database>(url, serviceKey);

  // Probe + lectura de clientes existentes.
  const { error: probeErr } = await sb.from('clients').select('id', { count: 'exact', head: true });
  if (probeErr) {
    console.error('No se pudo consultar public.clients:', probeErr.message);
    process.exit(1);
  }

  const existingClients = await fetchAllPages<{
    id: string;
    dni: string | null;
    telefono1: string | null;
    telefono2: string | null;
    import_source: string | null;
    import_external_key: string | null;
  }>(() =>
    sb
      .from('clients')
      .select('id, dni, telefono1, telefono2, import_source, import_external_key')
      .order('id', { ascending: true }),
  );

  const dniSet = new Set<string>();
  const phoneSet = new Set<string>();
  const importKeySet = new Set<string>();
  for (const c of existingClients) {
    if (c.dni) {
      const d = normalizeDni(c.dni);
      if (d) dniSet.add(d);
    }
    const k1 = normalizePhoneKey(c.telefono1);
    const k2 = normalizePhoneKey(c.telefono2);
    if (k1) phoneSet.add(k1);
    if (k2) phoneSet.add(k2);
    if (c.import_source === IMPORT_SOURCE && c.import_external_key) {
      importKeySet.add(c.import_external_key);
    }
  }
  console.log(
    'Existentes — clientes:',
    existingClients.length,
    '| con DNI:',
    dniSet.size,
    '| teléfonos normalizados únicos:',
    phoneSet.size,
    '| con import_source=' + IMPORT_SOURCE + ':',
    importKeySet.size,
  );

  // Mapa de comerciales (profiles) por nombre normalizado.
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, first_name, last_name, email');
  if (profErr) {
    console.warn('Aviso: no se pudieron leer profiles para mapear comercial:', profErr.message);
  }
  const profileByName = new Map<string, string>();
  for (const p of profiles ?? []) {
    const fn = p.first_name ?? '';
    const ln = p.last_name ?? '';
    const k1 = normalizeKey(`${fn} ${ln}`);
    const k2 = normalizeKey(`${ln} ${fn}`);
    if (k1) profileByName.set(k1, p.id);
    if (k2 && !profileByName.has(k2)) profileByName.set(k2, p.id);
  }

  const importBatchId = randomUUID();
  const report: string[] = [];
  let inserted = 0;
  let skippedImportKey = 0;
  let skippedDni = 0;
  let skippedPhone = 0;
  let skippedNoData = 0;
  let errors = 0;

  const seenDniThisRun = new Set<string>();
  const seenPhoneThisRun = new Set<string>();

  for (const p of parsed) {
    const extKey = `${IMPORT_SOURCE}:${p.id}`;
    if (importKeySet.has(extKey)) {
      report.push(`L${p.excelRow};SKIP_IMPORT_KEY;${p.id}`);
      skippedImportKey++;
      continue;
    }
    const dni = normalizeDni(p.cif);
    if (dni && (dniSet.has(dni) || seenDniThisRun.has(dni))) {
      report.push(`L${p.excelRow};SKIP_DNI;${p.id};${dni}`);
      skippedDni++;
      continue;
    }
    const phoneKey = normalizePhoneKey(p.telefono);
    if (!dni && phoneKey && (phoneSet.has(phoneKey) || seenPhoneThisRun.has(phoneKey))) {
      report.push(`L${p.excelRow};SKIP_PHONE;${p.id};${phoneKey}`);
      skippedPhone++;
      continue;
    }
    if (!p.cliente && !dni && !phoneKey && !p.email) {
      report.push(`L${p.excelRow};SKIP_NO_DATA;${p.id}`);
      skippedNoData++;
      continue;
    }

    const addr = parseAddress(p.direccion);
    const phoneDisp = phoneKey ? formatPhoneDisplay(p.telefono) : null;
    const comercialId = p.comercial ? profileByName.get(normalizeKey(p.comercial)) ?? null : null;
    const ibanNorm = normalizeIban(p.iban);
    if (ibanNorm && !ibanLooksValid(ibanNorm)) {
      report.push(`L${p.excelRow};WARN_IBAN_FORMAT;${p.id};${ibanNorm}`);
    }

    const ins: Database['public']['Tables']['clients']['Insert'] = {
      nombre_apellidos: (p.cliente || `CLIENTE ${p.id}`).toUpperCase(),
      direccion: addr.direccion || '-',
      localidad: addr.localidad,
      codigo_postal: addr.codigo_postal,
      telefono1: phoneDisp,
      telefono2: null,
      email: p.email || null,
      dni: dni,
      iban: ibanNorm,
      prospect: !dni,
      status: 'active',
      note: buildNote(p, importBatchId),
      import_batch_id: importBatchId,
      import_source: IMPORT_SOURCE,
      import_external_key: extKey,
      assigned_commercial_id: comercialId,
    };

    const { error: insErr } = await sb.from('clients').insert(ins);
    if (insErr) {
      report.push(`L${p.excelRow};ERROR;${p.id};${insErr.message}`);
      errors++;
      continue;
    }
    inserted++;
    if (dni) {
      dniSet.add(dni);
      seenDniThisRun.add(dni);
    }
    if (phoneKey) {
      phoneSet.add(phoneKey);
      seenPhoneThisRun.add(phoneKey);
    }
    importKeySet.add(extKey);
  }

  const reportPath = join(
    process.cwd(),
    'csvs',
    `import-clientes-xlsx-${importBatchId}.txt`,
  );
  writeFileSync(
    reportPath,
    [
      `file=${xlsxPath}`,
      `sheet=${ws.name}`,
      `import_batch_id=${importBatchId}`,
      `rows_in_excel=${parsed.length}`,
      `inserted=${inserted}`,
      `skipped_import_key=${skippedImportKey}`,
      `skipped_dni=${skippedDni}`,
      `skipped_phone=${skippedPhone}`,
      `skipped_no_data=${skippedNoData}`,
      `errors=${errors}`,
      '',
      ...report,
    ].join('\n'),
    'utf8',
  );

  console.log('Informe:', reportPath);
  console.log({
    importBatchId,
    inserted,
    skippedImportKey,
    skippedDni,
    skippedPhone,
    skippedNoData,
    errors,
  });
  if (inserted > 0) {
    console.log(
      `\nVer el lote en SQL Editor:\n  SELECT id, nombre_apellidos, dni, telefono1, email FROM public.clients WHERE import_batch_id = '${importBatchId}';`,
    );
  } else if (errors > 0) {
    console.error('\nNo se insertó ningún cliente. Revisa el informe (líneas ERROR).');
  } else {
    console.log('\nNada nuevo: todos los clientes del Excel ya estaban en el CRM.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
