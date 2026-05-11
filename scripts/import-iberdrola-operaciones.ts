/**
 * Importa csvs/Iberdrola.csv (o ruta por argv) en public.clients y public.client_supply_addresses.
 *
 * Estructura esperada del CSV (cabecera en la primera fila, separador coma):
 *   Fecha,ID,Cliente,Suministro,Tipo,Estado,Oferta,Call center,Agente,Provincia,Teléfono,
 *   Tipo de cliente,Notas,Clave,Token,Enviado Iberdrola
 *
 * Cada fila representa una operación sobre un suministro (Luz/Gas) de un cliente. Como un mismo
 * cliente puede aparecer varias veces (varias operaciones / varios CUPS), deduplicamos:
 *
 *   • Cliente: por DNI (extraído del paréntesis del campo Cliente) o, si no, por teléfono normalizado.
 *     Si ya existe en el CRM (independientemente del origen), se reutiliza su id.
 *   • Suministro: por (cliente, CUPS). Si ya existe esa combinación, se omite la inserción.
 *
 * NO se tocan `sales`. Estado/Oferta/Fecha/Clave/Token/Enviado Iberdrola se concatenan en
 * `client_supply_addresses.note` para preservar trazabilidad de la operación de Iberdrola.
 *
 * `clients.comercializadora` se asigna a IBERDROLA CLIENTES, S.A.U. (CNMC) en cada fila.
 *
 * Requisitos:
 *   - Migración 20260509180000_csv_import_clients_supply_sales.sql aplicada
 *     (clients.import_*; client_supply_addresses.direccion permite NULL).
 *   - .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY (service_role).
 *
 * Uso:
 *   npm run import:iberdrola
 *   npm run import:iberdrola -- ./csvs/otroFichero.csv
 *
 * Cuando los datos ya están en el CRM y hay que llevar el mismo formato al portal Iberdrola:
 *   npm run export:iberdrola -- [--solo-pendientes] [rutaSalida.csv]
 * Tras confirmar el envío en Iberdrola:
 *   npm run mark:iberdrola-enviado -- ./csvs/tu.csv [--valor SI]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import type { Database } from '../src/integrations/supabase/types';
import { COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U, IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV } from '../src/constants/crm-comercializadoras';

const IMPORT_SOURCE = IMPORT_SOURCE_IBERDROLA_OPERACIONES_CSV;

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

function normalizeUpperKey(s: string): string {
  return stripDiacritics(s).toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizeName(s: string): string {
  return stripDiacritics(s).toUpperCase().replace(/\s+/g, ' ').trim();
}

function normalizeDni(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return s || null;
}

function normalizePhoneKey(raw: string | null | undefined): string {
  if (raw == null) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 9 && /^[679]/.test(digits)) return `34${digits}`;
  if (digits.length === 11 && digits.startsWith('34')) return digits;
  return digits;
}

function formatPhoneDisplay(raw: string | null | undefined): string | null {
  const key = normalizePhoneKey(raw);
  if (!key) return null;
  if (key.length === 11 && key.startsWith('34')) {
    return `+${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8)}`;
  }
  return raw?.toString().trim() || null;
}

function normalizeCups(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (s.length >= 18 && s.startsWith('ES')) return s;
  return null;
}

/** Convierte 'Coruña, A' (formato INE) a 'A Coruña' para ser legible. Mantiene otros valores tal cual. */
function tidyProvincia(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^(.+?),\s*([A-ZÁÉÍÓÚÑa-záéíóúñ]+)$/u);
  if (m) return `${m[2]} ${m[1]}`.trim();
  return t;
}

/** "DD/MM/YYYY" → "YYYY-MM-DD" en UTC; null si no parsea. */
function parseFechaDmy(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number.parseInt(m[1]!, 10);
  const mon = Number.parseInt(m[2]!, 10);
  const year = Number.parseInt(m[3]!, 10);
  if (!day || !mon || !year || mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, mon - 1, day));
  return d.toISOString().slice(0, 10);
}

/** "DAVID GARCÍA PEREZ (79312395T)" → { name, dni }. Si no hay paréntesis, dni = null. */
function splitClienteField(raw: string): { name: string; dni: string | null } {
  const t = (raw ?? '').trim();
  if (!t) return { name: '', dni: null };
  const m = t.match(/^(.+?)\s*\(\s*([^)]+)\s*\)\s*$/);
  if (!m) return { name: t, dni: null };
  return { name: m[1]!.trim(), dni: normalizeDni(m[2]) };
}

interface CsvRow {
  Fecha?: string;
  ID?: string;
  Cliente?: string;
  Suministro?: string;
  Tipo?: string;
  Estado?: string;
  Oferta?: string;
  'Call center'?: string;
  Agente?: string;
  Provincia?: string;
  Teléfono?: string;
  'Tipo de cliente'?: string;
  Notas?: string;
  Clave?: string;
  Token?: string;
  'Enviado Iberdrola'?: string;
  [k: string]: string | undefined;
}

interface ParsedRow {
  csvLine: number;
  fechaIso: string | null;
  fechaRaw: string;
  opId: string;
  cliente: { name: string; dni: string | null };
  cups: string | null;
  tipo: string;
  estado: string;
  oferta: string;
  callCenter: string;
  agente: string;
  provincia: string | null;
  telefono: string;
  tipoCliente: string;
  notas: string;
  clave: string;
  token: string;
  enviadoIberdrola: string;
}

function buildSupplyNote(p: ParsedRow, batchId: string): string {
  const parts: string[] = [];
  if (p.tipo) parts.push(`Tipo: ${p.tipo}`);
  if (p.estado) parts.push(`Estado: ${p.estado}`);
  if (p.oferta) parts.push(`Oferta: ${p.oferta}`);
  if (p.fechaIso) parts.push(`Fecha: ${p.fechaIso}`);
  else if (p.fechaRaw) parts.push(`Fecha: ${p.fechaRaw}`);
  if (p.agente) parts.push(`Agente: ${p.agente}`);
  if (p.callCenter) parts.push(`Call center: ${p.callCenter}`);
  if (p.tipoCliente) parts.push(`Tipo cliente: ${p.tipoCliente}`);
  if (p.clave) parts.push(`Clave: ${p.clave}`);
  if (p.token) parts.push(`Token: ${p.token}`);
  if (p.enviadoIberdrola) parts.push(`Enviado Iberdrola: ${p.enviadoIberdrola}`);
  if (p.notas) parts.push(`Notas: ${p.notas}`);
  parts.push(`Importado ${IMPORT_SOURCE} · ID origen ${p.opId} · lote ${batchId}`);
  return parts.join('\n');
}

async function fetchAllPages<T>(
  query: () => {
    range: (
      from: number,
      to: number,
    ) => Promise<{ data: T[] | null; error: { message: string } | null }>;
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

  const csvPath = process.argv[2] || join(process.cwd(), 'csvs', 'Iberdrola.csv');
  if (!existsSync(csvPath)) {
    console.error('No existe el CSV:', csvPath);
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, 'utf8');
  const parsedCsv = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsedCsv.errors.length) {
    const sample = parsedCsv.errors.slice(0, 3).map((e) => `${e.row ?? '?'}: ${e.message}`).join('\n');
    console.warn('Avisos al parsear el CSV (primeros):', sample);
  }

  const requiredHeaders = ['Fecha', 'ID', 'Cliente', 'Suministro', 'Tipo', 'Estado', 'Teléfono'];
  const presentHeaders = (parsedCsv.meta.fields ?? []).map((h) => h.trim());
  const missing = requiredHeaders.filter((h) => !presentHeaders.includes(h));
  if (missing.length) {
    console.error(
      'Cabecera inesperada. Faltan columnas:',
      missing.join(', '),
      '\nDetectadas:',
      presentHeaders.join(' | '),
    );
    process.exit(1);
  }

  const rows: ParsedRow[] = [];
  for (let i = 0; i < parsedCsv.data.length; i++) {
    const row = parsedCsv.data[i] ?? {};
    const opId = (row.ID ?? '').trim();
    if (!opId) continue;
    const cliente = splitClienteField(row.Cliente ?? '');
    rows.push({
      csvLine: i + 2,
      fechaRaw: (row.Fecha ?? '').trim(),
      fechaIso: parseFechaDmy(row.Fecha ?? ''),
      opId,
      cliente,
      cups: normalizeCups(row.Suministro ?? ''),
      tipo: (row.Tipo ?? '').trim(),
      estado: (row.Estado ?? '').trim(),
      oferta: (row.Oferta ?? '').trim(),
      callCenter: (row['Call center'] ?? '').trim(),
      agente: (row.Agente ?? '').trim(),
      provincia: tidyProvincia(row.Provincia ?? ''),
      telefono: (row.Teléfono ?? '').trim(),
      tipoCliente: (row['Tipo de cliente'] ?? '').trim(),
      notas: (row.Notas ?? '').trim(),
      clave: (row.Clave ?? '').trim(),
      token: (row.Token ?? '').trim(),
      enviadoIberdrola: (row['Enviado Iberdrola'] ?? '').trim(),
    });
  }

  console.log('Filas detectadas:', rows.length, '(fichero:', csvPath, ')');

  const sb = createClient<Database>(url, serviceKey);

  const { error: probeErr } = await sb.from('clients').select('id', { count: 'exact', head: true });
  if (probeErr) {
    console.error('No se pudo consultar public.clients:', probeErr.message);
    process.exit(1);
  }

  // Pre-cargar clientes existentes para dedup por DNI o teléfono.
  const existingClients = await fetchAllPages<{
    id: string;
    dni: string | null;
    telefono1: string | null;
    telefono2: string | null;
  }>(() =>
    sb.from('clients').select('id, dni, telefono1, telefono2').order('id', { ascending: true }),
  );
  const dniToClientId = new Map<string, string>();
  const phoneToClientId = new Map<string, string>();
  for (const c of existingClients) {
    if (c.dni) {
      const d = normalizeDni(c.dni);
      if (d && !dniToClientId.has(d)) dniToClientId.set(d, c.id);
    }
    const k1 = normalizePhoneKey(c.telefono1);
    const k2 = normalizePhoneKey(c.telefono2);
    if (k1 && !phoneToClientId.has(k1)) phoneToClientId.set(k1, c.id);
    if (k2 && !phoneToClientId.has(k2)) phoneToClientId.set(k2, c.id);
  }

  // Pre-cargar TODOS los CUPS existentes (independientemente del cliente).
  const existingSupplies = await fetchAllPages<{
    client_id: string;
    cups: string | null;
  }>(() =>
    sb.from('client_supply_addresses').select('client_id, cups').order('client_id', { ascending: true }),
  );
  // Set "cliente|cups" para detectar duplicados exactos en este cliente.
  const supplyKeySet = new Set<string>();
  // Set global de CUPS para avisar si el CUPS existe en otro cliente (no insertar duplicado).
  const cupsToClientId = new Map<string, string>();
  for (const s of existingSupplies) {
    if (!s.cups) continue;
    const c = s.cups.toUpperCase();
    supplyKeySet.add(`${s.client_id}|${c}`);
    if (!cupsToClientId.has(c)) cupsToClientId.set(c, s.client_id);
  }

  console.log(
    'En BD — clientes:',
    existingClients.length,
    '| CUPS:',
    existingSupplies.length,
    '| comerciales (profiles): cargando…',
  );

  // Mapa profile por nombre (para asignar comercial best-effort por el campo Agente).
  const { data: profiles, error: profErr } = await sb
    .from('profiles')
    .select('id, first_name, last_name, email');
  if (profErr) {
    console.warn('No se pudieron cargar profiles:', profErr.message);
  }
  const profileByName = new Map<string, string>();
  for (const p of profiles ?? []) {
    const fn = p.first_name ?? '';
    const ln = p.last_name ?? '';
    const k1 = normalizeUpperKey(`${fn} ${ln}`);
    const k2 = normalizeUpperKey(`${ln} ${fn}`);
    if (k1) profileByName.set(k1, p.id);
    if (k2 && !profileByName.has(k2)) profileByName.set(k2, p.id);
  }

  const importBatchId = randomUUID();
  const report: string[] = [];
  let clientsInserted = 0;
  let clientsReused = 0;
  let suppliesInserted = 0;
  let suppliesSkippedSame = 0;
  let suppliesSkippedOtherClient = 0;
  let skippedNoClientData = 0;
  let skippedNoCups = 0;
  let errors = 0;

  for (const r of rows) {
    const dni = r.cliente.dni;
    const phoneKey = normalizePhoneKey(r.telefono);

    if (!dni && !phoneKey && !r.cliente.name) {
      report.push(`L${r.csvLine};SKIP_NO_CLIENT_DATA;${r.opId}`);
      skippedNoClientData++;
      continue;
    }

    // 1) Resolver client_id (reutilizar o crear).
    let clientId: string | null = null;
    if (dni && dniToClientId.has(dni)) clientId = dniToClientId.get(dni)!;
    if (!clientId && phoneKey && phoneToClientId.has(phoneKey)) clientId = phoneToClientId.get(phoneKey)!;

    if (clientId) {
      clientsReused++;
    } else {
      const comercialName = r.agente ? normalizeUpperKey(r.agente) : '';
      const ins: Database['public']['Tables']['clients']['Insert'] = {
        nombre_apellidos: normalizeName(r.cliente.name || `CLIENTE ${r.opId}`),
        direccion: '-',
        localidad: r.provincia,
        codigo_postal: null,
        telefono1: phoneKey ? formatPhoneDisplay(r.telefono) : null,
        telefono2: null,
        email: null,
        dni: dni,
        prospect: !dni,
        status: 'active',
        note: `Importado ${IMPORT_SOURCE} · primera op ID ${r.opId} · lote ${importBatchId}`,
        import_batch_id: importBatchId,
        import_source: IMPORT_SOURCE,
        import_external_key: dni
          ? `iberdrola_cli_dni:${dni}`
          : phoneKey
            ? `iberdrola_cli_tel:${phoneKey}`
            : `iberdrola_cli_op:${r.opId}`,
        assigned_commercial_id: comercialName ? profileByName.get(comercialName) ?? null : null,
        comercializadora: COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U,
      };
      const { data: created, error: insErr } = await sb
        .from('clients')
        .insert(ins)
        .select('id')
        .single();
      if (insErr || !created) {
        report.push(
          `L${r.csvLine};ERROR_CLIENT_INSERT;${r.opId};${insErr?.message ?? 'sin id'}`,
        );
        errors++;
        continue;
      }
      clientId = created.id;
      clientsInserted++;
      if (dni) dniToClientId.set(dni, clientId);
      if (phoneKey) phoneToClientId.set(phoneKey, clientId);
    }

    {
      const { error: comErr } = await sb
        .from('clients')
        .update({ comercializadora: COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U })
        .eq('id', clientId);
      if (comErr) {
        report.push(`L${r.csvLine};WARN_COMERCIALIZADORA;${r.opId};${comErr.message}`);
      }
    }

    // 2) Suministro (solo si hay CUPS).
    if (!r.cups) {
      report.push(`L${r.csvLine};SKIP_NO_CUPS;${r.opId};client=${clientId}`);
      skippedNoCups++;
      continue;
    }
    const supplyKey = `${clientId}|${r.cups}`;
    if (supplyKeySet.has(supplyKey)) {
      report.push(`L${r.csvLine};SKIP_SUPPLY_DUP;${r.opId};${r.cups}`);
      suppliesSkippedSame++;
      continue;
    }
    const cupsOwner = cupsToClientId.get(r.cups);
    if (cupsOwner && cupsOwner !== clientId) {
      report.push(
        `L${r.csvLine};SKIP_SUPPLY_OTHER_CLIENT;${r.opId};${r.cups};owner=${cupsOwner}`,
      );
      suppliesSkippedOtherClient++;
      continue;
    }

    const supplyIns: Database['public']['Tables']['client_supply_addresses']['Insert'] = {
      client_id: clientId,
      label: r.tipo ? `Iberdrola — ${r.tipo}` : 'Iberdrola',
      direccion: null,
      localidad: r.provincia,
      codigo_postal: null,
      cups: r.cups,
      note: buildSupplyNote(r, importBatchId),
    };
    const { error: supErr } = await sb.from('client_supply_addresses').insert(supplyIns);
    if (supErr) {
      report.push(`L${r.csvLine};ERROR_SUPPLY_INSERT;${r.opId};${r.cups};${supErr.message}`);
      errors++;
      continue;
    }
    suppliesInserted++;
    supplyKeySet.add(supplyKey);
    cupsToClientId.set(r.cups, clientId);
  }

  const reportPath = join(process.cwd(), 'csvs', `import-iberdrola-${importBatchId}.txt`);
  writeFileSync(
    reportPath,
    [
      `file=${csvPath}`,
      `import_batch_id=${importBatchId}`,
      `rows_in_csv=${rows.length}`,
      `clients_inserted=${clientsInserted}`,
      `clients_reused=${clientsReused}`,
      `supplies_inserted=${suppliesInserted}`,
      `supplies_skipped_same=${suppliesSkippedSame}`,
      `supplies_skipped_other_client=${suppliesSkippedOtherClient}`,
      `skipped_no_client_data=${skippedNoClientData}`,
      `skipped_no_cups=${skippedNoCups}`,
      `errors=${errors}`,
      '',
      ...report,
    ].join('\n'),
    'utf8',
  );

  console.log('Informe:', reportPath);
  console.log({
    importBatchId,
    clientsInserted,
    clientsReused,
    suppliesInserted,
    suppliesSkippedSame,
    suppliesSkippedOtherClient,
    skippedNoClientData,
    skippedNoCups,
    errors,
  });
  if (clientsInserted > 0 || suppliesInserted > 0) {
    console.log(
      `\nVer en SQL Editor:\n  SELECT id, nombre_apellidos, dni, telefono1, localidad FROM public.clients WHERE import_batch_id = '${importBatchId}';\n  SELECT s.client_id, s.cups, s.label, c.nombre_apellidos FROM public.client_supply_addresses s JOIN public.clients c ON c.id = s.client_id WHERE s.note ILIKE '%lote ${importBatchId}%';`,
    );
  } else if (errors > 0) {
    console.error('\nNo se insertó nada. Revisa el informe (líneas ERROR).');
  } else {
    console.log('\nNada nuevo: todo lo del CSV ya estaba en el CRM.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
