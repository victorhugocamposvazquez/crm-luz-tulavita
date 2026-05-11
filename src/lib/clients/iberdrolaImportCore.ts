/**
 * CSV tipo «operaciones» (columnas Fecha, ID, Cliente, Suministro…) → clients + client_supply_addresses.
 * El formato suele coincidir con exportaciones de varias comercializadoras; la marca en CRM es la elegida al importar.
 *
 * Usado por `import:iberdrola` (CLI) y por la importación CSV desde la UI (admin).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import {
  COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U,
  IMPORT_SOURCE_OPERACIONES_COMERCIALIZADORA_CSV,
} from '@/constants/crm-comercializadoras';

/** Valor guardado en `clients.import_source` y en líneas «Importado …» de notas para este tipo de CSV. */
export const OPERACIONES_CSV_IMPORT_SOURCE = IMPORT_SOURCE_OPERACIONES_COMERCIALIZADORA_CSV;

export const OPERACIONES_CSV_REQUIRED_HEADERS = [
  'Fecha',
  'ID',
  'Cliente',
  'Suministro',
  'Tipo',
  'Estado',
  'Teléfono',
] as const;

export interface IberdrolaCsvRow {
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

export interface IberdrolaParsedRow {
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

export interface IberdrolaImportStats {
  importBatchId: string;
  clientsInserted: number;
  clientsReused: number;
  suppliesInserted: number;
  suppliesSkippedSame: number;
  suppliesSkippedOtherClient: number;
  skippedNoClientData: number;
  skippedNoCups: number;
  errors: number;
  report: string[];
}

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}

export function normalizeUpperKey(s: string): string {
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

export function normalizePhoneKey(raw: string | null | undefined): string {
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

function tidyProvincia(raw: string | null | undefined): string | null {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const m = t.match(/^(.+?),\s*([A-ZÁÉÍÓÚÑa-záéíóúñ]+)$/u);
  if (m) return `${m[2]} ${m[1]}`.trim();
  return t;
}

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

function splitClienteField(raw: string): { name: string; dni: string | null } {
  const t = (raw ?? '').trim();
  if (!t) return { name: '', dni: null };
  const m = t.match(/^(.+?)\s*\(\s*([^)]+)\s*\)\s*$/);
  if (!m) return { name: t, dni: null };
  return { name: m[1]!.trim(), dni: normalizeDni(m[2]) };
}

export function buildIberdrolaSupplyNote(p: IberdrolaParsedRow, batchId: string): string {
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
  parts.push(`Importado ${OPERACIONES_CSV_IMPORT_SOURCE} · ID origen ${p.opId} · lote ${batchId}`);
  return parts.join('\n');
}

export function validateIberdrolaCsvHeaders(fields: string[] | undefined): string | null {
  const present = (fields ?? []).map((h) => h.trim());
  const missing = OPERACIONES_CSV_REQUIRED_HEADERS.filter((h) => !present.includes(h));
  if (missing.length) {
    return `Faltan columnas: ${missing.join(', ')}. Detectadas: ${present.join(' | ')}`;
  }
  return null;
}

export function mapPapaRowsToIberdrolaParsed(
  data: IberdrolaCsvRow[],
): IberdrolaParsedRow[] {
  const rows: IberdrolaParsedRow[] = [];
  for (let i = 0; i < data.length; i++) {
    const row = data[i] ?? {};
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
  return rows;
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

export interface IberdrolaCsvImportOptions {
  /** Valor guardado en `clients.comercializadora` para esta importación (`null` = sin comercializadora). */
  comercializadora: string | null;
}

function resolveComercializadoraForImport(options?: IberdrolaCsvImportOptions): string | null {
  if (options === undefined) return COMERCIALIZADORA_IBERDROLA_CLIENTES_SA_U;
  return options.comercializadora;
}

export async function runIberdrolaCsvImport(
  sb: SupabaseClient<Database>,
  rows: IberdrolaParsedRow[],
  importBatchId: string,
  options?: IberdrolaCsvImportOptions,
): Promise<IberdrolaImportStats> {
  const comercializadoraValue = resolveComercializadoraForImport(options);
  const report: string[] = [];
  let clientsInserted = 0;
  let clientsReused = 0;
  let suppliesInserted = 0;
  let suppliesSkippedSame = 0;
  let suppliesSkippedOtherClient = 0;
  let skippedNoClientData = 0;
  let skippedNoCups = 0;
  let errors = 0;

  const existingClients = await fetchAllPages<{
    id: string;
    dni: string | null;
    telefono1: string | null;
    telefono2: string | null;
  }>((from, to) =>
    sb.from('clients').select('id, dni, telefono1, telefono2').order('id', { ascending: true }).range(from, to),
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

  const existingSupplies = await fetchAllPages<{
    client_id: string;
    cups: string | null;
  }>((from, to) =>
    sb
      .from('client_supply_addresses')
      .select('client_id, cups')
      .order('client_id', { ascending: true })
      .range(from, to),
  );

  const supplyKeySet = new Set<string>();
  const cupsToClientId = new Map<string, string>();
  for (const s of existingSupplies) {
    if (!s.cups) continue;
    const c = s.cups.toUpperCase();
    supplyKeySet.add(`${s.client_id}|${c}`);
    if (!cupsToClientId.has(c)) cupsToClientId.set(c, s.client_id);
  }

  const { data: profiles } = await sb.from('profiles').select('id, first_name, last_name, email');
  const profileByName = new Map<string, string>();
  for (const p of profiles ?? []) {
    const fn = p.first_name ?? '';
    const ln = p.last_name ?? '';
    const k1 = normalizeUpperKey(`${fn} ${ln}`);
    const k2 = normalizeUpperKey(`${ln} ${fn}`);
    if (k1) profileByName.set(k1, p.id);
    if (k2 && !profileByName.has(k2)) profileByName.set(k2, p.id);
  }

  for (const r of rows) {
    const dni = r.cliente.dni;
    const phoneKey = normalizePhoneKey(r.telefono);

    if (!dni && !phoneKey && !r.cliente.name) {
      report.push(`L${r.csvLine};SKIP_NO_CLIENT_DATA;${r.opId}`);
      skippedNoClientData++;
      continue;
    }

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
        dni,
        prospect: !dni,
        status: 'active',
        note: `Importado ${OPERACIONES_CSV_IMPORT_SOURCE} · primera op ID ${r.opId} · lote ${importBatchId}`,
        import_batch_id: importBatchId,
        import_source: OPERACIONES_CSV_IMPORT_SOURCE,
        import_external_key: dni
          ? `operaciones_csv_cli_dni:${dni}`
          : phoneKey
            ? `operaciones_csv_cli_tel:${phoneKey}`
            : `operaciones_csv_cli_op:${r.opId}`,
        assigned_commercial_id: comercialName ? profileByName.get(comercialName) ?? null : null,
        comercializadora: comercializadoraValue,
      };
      const { data: created, error: insErr } = await sb
        .from('clients')
        .insert(ins)
        .select('id')
        .single();
      if (insErr || !created) {
        report.push(`L${r.csvLine};ERROR_CLIENT_INSERT;${r.opId};${insErr?.message ?? 'sin id'}`);
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
        .update({ comercializadora: comercializadoraValue })
        .eq('id', clientId);
      if (comErr) {
        report.push(`L${r.csvLine};WARN_COMERCIALIZADORA;${r.opId};${comErr.message}`);
      }
    }

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
      report.push(`L${r.csvLine};SKIP_SUPPLY_OTHER_CLIENT;${r.opId};${r.cups};owner=${cupsOwner}`);
      suppliesSkippedOtherClient++;
      continue;
    }

    const supplyIns: Database['public']['Tables']['client_supply_addresses']['Insert'] = {
      client_id: clientId,
      label: r.tipo ? `Operaciones — ${r.tipo}` : 'Operaciones',
      direccion: null,
      localidad: r.provincia,
      codigo_postal: null,
      cups: r.cups,
      note: buildIberdrolaSupplyNote(r, importBatchId),
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

  return {
    importBatchId,
    clientsInserted,
    clientsReused,
    suppliesInserted,
    suppliesSkippedSame,
    suppliesSkippedOtherClient,
    skippedNoClientData,
    skippedNoCups,
    errors,
    report,
  };
}
