/**
 * Importa csvs/VENTAS TULAVITA.csv (o ruta por argv) en public.clients, client_supply_addresses y sales.
 *
 * Requisitos:
 *   - Migración 20260509180000_csv_import_clients_supply_sales.sql aplicada.
 *   - .env.local (o .env): SUPABASE_URL o VITE_SUPABASE_URL, y SUPABASE_SERVICE_ROLE_KEY (clave service_role del proyecto)
 *   - Opcional: ventas-tulavita.agentes.json (UUID de profiles). Sin él: clientes + suministros; ventas omitidas.
 *
 * Uso: npm run import:ventas-tulavita
 *       VENTAS_IMPORT_YEAR=2025 npm run import:ventas-tulavita -- ./csvs/otro.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash, randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import type { Database } from '../src/integrations/supabase/types';

const IMPORT_SOURCE = 'ventas_tulavita_csv';

type AgentMap = Record<string, string>;
type CompaniesFile = { fallbackCompanyName: string; aliases: Record<string, string> };

const MONTHS: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sept: 8,
  sep: 8,
  set: 8,
  oct: 9,
  nov: 10,
  dic: 11,
};

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Evita enviar "" a columnas uuid (Postgres falla). */
function nilUuid(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  if (!s || !UUID_RE.test(s)) return null;
  return s;
}

/** La anon key no bypass RLS; hace falta service_role. */
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
        '). Con la clave anon los inserts en clients suelen fallar por RLS.\n   En Supabase: Project Settings → API → service_role (secreta), copia a SUPABASE_SERVICE_ROLE_KEY en .env.local\n',
      );
    }
  } catch {
    // ignore
  }
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhoneKey(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9 && /^[679]/.test(digits)) return `34${digits}`;
  if (digits.length === 11 && digits.startsWith('34')) return digits;
  return digits;
}

function formatPhoneDisplay(raw: string | null): string | null {
  const key = normalizePhoneKey(raw);
  if (!key) return null;
  if (key.length === 11 && key.startsWith('34')) {
    return `+${key.slice(0, 2)} ${key.slice(2, 5)} ${key.slice(5, 8)} ${key.slice(8)}`;
  }
  return raw?.trim() || null;
}

function externalKey(cliente: string, phoneKey: string): string {
  const base = `${normalizeName(cliente)}|${phoneKey}`;
  return createHash('sha256').update(base).digest('hex');
}

function normalizeCups(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (s.length >= 16 && s.startsWith('ES')) return s;
  return null;
}

function parseEuro(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const t = raw.replace(/€/g, '').trim().replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseFecha(raw: string, year: number): string | null {
  const t = raw.trim().toLowerCase();
  const parts = t.split('-').map((p) => p.trim());
  if (parts.length < 2) return null;
  const day = Number.parseInt(parts[0], 10);
  const mon = MONTHS[parts[1]];
  if (!Number.isFinite(day) || mon === undefined) return null;
  const d = new Date(Date.UTC(year, mon, day));
  return d.toISOString().slice(0, 10);
}

interface ParsedRow {
  lineIndex: number;
  fechaIso: string | null;
  cliente: string;
  telefono: string | null;
  localityHint: string | null;
  cups: string | null;
  agente: string;
  tipoEnergy: string | null;
  euros: number | null;
  compania: string;
}

function modeString(values: string[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) {
    const u = v.trim().toUpperCase();
    if (!u) continue;
    c.set(u, (c.get(u) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best;
}

function resolveCompanyCanonical(raw: string, aliases: Record<string, string>, fallback: string): string {
  const t = raw.trim();
  if (!t) return fallback;
  const upper = t.toUpperCase();
  const entries = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canon] of entries) {
    const au = alias.trim().toUpperCase();
    if (upper === au) return canon;
  }
  for (const [alias, canon] of entries) {
    const au = alias.trim().toUpperCase();
    if (au.length >= 3 && upper.includes(au)) return canon;
  }
  return t.replace(/\s+/g, ' ').trim() || fallback;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function ensureCompany(sb: ReturnType<typeof createClient<Database>>, name: string): Promise<string> {
  const { data: existing, error: e1 } = await sb.from('companies').select('id').eq('name', name).maybeSingle();
  if (e1) throw e1;
  if (existing?.id) return existing.id;
  const { data: ins, error: e2 } = await sb.from('companies').insert({ name }).select('id').single();
  if (e2) throw e2;
  return ins.id;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'Faltan variables en .env.local (o .env):\n  SUPABASE_URL (o VITE_SUPABASE_URL)\n  SUPABASE_SERVICE_ROLE_KEY  ← debe ser la clave service_role, no la anon',
    );
    process.exit(1);
  }
  warnIfNotServiceRole(serviceKey);

  const year = Number.parseInt(process.env.VENTAS_IMPORT_YEAR ?? '2025', 10);
  const csvPath =
    process.argv[2] ||
    join(process.cwd(), 'csvs', 'VENTAS TULAVITA.csv');

  if (!existsSync(csvPath)) {
    console.error('No existe el CSV:', csvPath);
    process.exit(1);
  }

  const agentPath = join(process.cwd(), 'scripts', 'config', 'ventas-tulavita.agentes.json');
  const agentExample = join(process.cwd(), 'scripts', 'config', 'ventas-tulavita.agentes.example.json');
  let rawAgents: Record<string, string> = {};
  if (!existsSync(agentPath)) {
    console.warn(
      'No existe ventas-tulavita.agentes.json — se crean clientes y suministros; las filas de venta se omiten (sin comercial UUID).\n' +
        (existsSync(agentExample) ? `Plantilla: ${agentExample}\n` : ''),
    );
  } else {
    rawAgents = loadJson<Record<string, string>>(agentPath);
  }
  const agentsMap: AgentMap = {};
  let defaultCommercial: string | null = null;
  for (const [k, vin] of Object.entries(rawAgents)) {
    if (k.startsWith('_')) continue;
    const ku = k.trim().toUpperCase();
    if (ku === 'DEFAULT') {
      defaultCommercial = nilUuid(vin);
      if ((vin ?? '').trim() && !defaultCommercial) {
        console.warn('⚠️  DEFAULT no es un UUID válido; las ventas sin agente mapeado se omitirán.');
      }
      continue;
    }
    const id = nilUuid(vin);
    if ((vin ?? '').trim() && !id) {
      console.warn(`⚠️  Agente "${k}" tiene valor que no es UUID válido, se ignorará.`);
    }
    if (id) agentsMap[ku] = id;
  }
  if (!defaultCommercial) {
    console.warn('⚠️  DEFAULT vacío o ausente: las ventas sin agente mapeado se omitirán.');
  }

  const companiesCfg = loadJson<CompaniesFile>(
    join(process.cwd(), 'scripts', 'config', 'ventas-tulavita.companies.json'),
  );
  const fallbackCo = companiesCfg.fallbackCompanyName;

  const csvText = readFileSync(csvPath, 'utf8');
  const parsed = Papa.parse<string[]>(csvText, {
    delimiter: ';',
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  if (rows.length < 2) {
    console.error('CSV vacío o sin datos');
    process.exit(1);
  }

  const dataRows = rows.slice(1);
  const parsedRows: ParsedRow[] = [];
  const report: string[] = [];

  let lineIndex = 2;
  for (const cells of dataRows) {
    const c = [...cells];
    while (c.length < 10) c.push('');

    const fechaRaw = c[0]?.trim() ?? '';
    const cliente = (c[1]?.trim() ?? '').replace(/\s+/g, ' ');
    if (!cliente) {
      lineIndex++;
      continue;
    }

    const telefono = formatPhoneDisplay(c[2] || null);
    const localityHint = (c[3]?.trim() || null) && !normalizeCups(c[3]) ? c[3].trim() : null;
    let cups = normalizeCups(c[4]) || normalizeCups(c[3]);
    const agente = (c[6]?.trim() ?? '').toUpperCase();
    const tipoEnergy = (c[7]?.trim() || null) && c[7].trim().length <= 6 ? c[7].trim() : null;
    const euros = parseEuro(c[8] || null);
    const compania = (c[9]?.trim() ?? '').replace(/\s+/g, ' ');

    let fechaIso: string | null = null;
    if (fechaRaw) fechaIso = parseFecha(fechaRaw, year);
    if (!fechaIso) {
      report.push(`L${lineIndex};WARN;Fecha no parseada "${fechaRaw}", usando ${year}-08-01`);
      fechaIso = `${year}-08-01`;
    }

    parsedRows.push({
      lineIndex,
      fechaIso,
      cliente,
      telefono,
      localityHint,
      cups,
      agente,
      tipoEnergy,
      euros,
      compania,
    });
    lineIndex++;
  }

  console.log('Resumen CSV:', {
    archivo: csvPath,
    filasConCliente: parsedRows.length,
    empresaPorDefecto: fallbackCo,
  });

  const sb = createClient<Database>(url, serviceKey);

  try {
    const u = new URL(url);
    const { error: probeErr, count } = await sb
      .from('clients')
      .select('id', { count: 'exact', head: true });
    if (probeErr) {
      console.error('No se pudo consultar public.clients:', probeErr.message, '(¿migración aplicada?)');
      process.exit(1);
    }
    console.log('Conexión Supabase OK:', u.host, '| clients (total aprox.):', count ?? '?');
  } catch {
    console.log('URL Supabase:', url.slice(0, 36) + '…');
  }

  const canonicalNames = new Set<string>([fallbackCo]);
  for (const r of parsedRows) {
    canonicalNames.add(resolveCompanyCanonical(r.compania, companiesCfg.aliases, fallbackCo));
  }
  const companyIdByName = new Map<string, string>();
  for (const name of canonicalNames) {
    companyIdByName.set(name, await ensureCompany(sb, name));
  }

  const importBatchId = randomUUID();

  const groups = new Map<string, ParsedRow[]>();
  for (const r of parsedRows) {
    const pk = normalizePhoneKey(r.telefono);
    const key = externalKey(r.cliente, pk);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  console.log('Grupos cliente (hash nombre+tel):', groups.size);

  let clientsCreated = 0;
  let suppliesCreated = 0;
  let suppliesSkippedDup = 0;
  let salesCreated = 0;
  let salesSkipped = 0;

  const supplyKeysSeen = new Set<string>();

  for (const [extKey, gRows] of groups) {
    const nombre = gRows[0]!.cliente;
    const phone = gRows.map((r) => r.telefono).find(Boolean) ?? null;
    const topAgent = modeString(gRows.map((r) => r.agente)) ?? '';

    const commercialId = nilUuid(
      (topAgent && agentsMap[topAgent]) || defaultCommercial || null,
    );

    const { data: existing } = await sb
      .from('clients')
      .select('id')
      .eq('import_external_key', extKey)
      .maybeSingle();

    let clientId: string;
    if (existing?.id) {
      clientId = existing.id;
      report.push(`CLIENT_DEDUP;${nombre};existing import_external_key`);
    } else {
      const ins = {
        nombre_apellidos: nombre.toUpperCase(),
        direccion: 'Pendiente — importación CSV',
        localidad: gRows.find((r) => r.localityHint)?.localityHint ?? null,
        codigo_postal: null,
        telefono1: phone,
        telefono2: null,
        email: null,
        dni: null,
        prospect: true,
        status: 'active',
        note: `Importado ${IMPORT_SOURCE} lote ${importBatchId}`,
        import_batch_id: importBatchId,
        import_source: IMPORT_SOURCE,
        import_external_key: extKey,
        assigned_commercial_id: commercialId,
      };

      const { data: row, error } = await sb.from('clients').insert(ins).select('id').single();
      if (error) {
        report.push(`ERROR_CLIENT;${nombre};${error.message}`);
        console.error('Insert client falló:', nombre, error.message, error.code ?? '');
        continue;
      }
      clientId = row.id;
      clientsCreated++;
    }

    let sortOrder = 0;
    for (const r of gRows) {
      const cupsKey = r.cups ? `${clientId}:${r.cups}` : '';
      const isDupSupply = Boolean(cupsKey && supplyKeysSeen.has(cupsKey));
      if (isDupSupply) {
        suppliesSkippedDup++;
      } else {
        const hasSupplyData = Boolean(r.cups || r.localityHint);
        if (!hasSupplyData) {
          report.push(`SKIP_SUPPLY;L${r.lineIndex};sin CUPS ni localidad`);
        } else {
          if (cupsKey) supplyKeysSeen.add(cupsKey);

          const noteParts = [
            r.fechaIso ? `Envío ${r.fechaIso}` : null,
            r.compania ? `Compañía: ${r.compania}` : null,
            r.euros != null ? `Importe CSV: ${r.euros} €` : null,
            !r.cups && r.localityHint ? `Ubicación indicada: ${r.localityHint}` : null,
            `Línea origen: ${r.lineIndex}`,
          ].filter(Boolean);

          const payload = {
            client_id: clientId,
            label: r.tipoEnergy ? `${r.tipoEnergy}` : null,
            direccion: r.cups ? null : r.localityHint,
            localidad: r.localityHint && !r.cups ? r.localityHint : null,
            codigo_postal: null,
            cups: r.cups,
            note: noteParts.join(' · '),
            sort_order: sortOrder++,
          };

          const { error: se } = await sb.from('client_supply_addresses').insert(payload);
          if (se) {
            if (se.code === '23505') {
              suppliesSkippedDup++;
            } else {
              report.push(`ERROR_SUPPLY;L${r.lineIndex};${se.message}`);
            }
          } else {
            suppliesCreated++;
          }
        }
      }

      const canonicalCo = resolveCompanyCanonical(r.compania, companiesCfg.aliases, fallbackCo);
      const companyId = companyIdByName.get(canonicalCo);
      if (!companyId) {
        report.push(`SKIP_SALE;L${r.lineIndex};sin company_id`);
        salesSkipped++;
        continue;
      }

      const saleCommercial = nilUuid(
        (r.agente && agentsMap[r.agente]) || defaultCommercial || commercialId || null,
      );
      if (r.euros == null || r.euros <= 0) {
        salesSkipped++;
        continue;
      }
      if (!saleCommercial) {
        report.push(`SKIP_SALE;L${r.lineIndex};sin commercial_id (${r.agente})`);
        salesSkipped++;
        continue;
      }

      const saleRow = {
        client_id: clientId,
        company_id: companyId,
        amount: r.euros,
        commission_amount: 0,
        commission_percentage: 0,
        sale_date: r.fechaIso ?? `${year}-01-01`,
        commercial_id: saleCommercial,
        visit_id: null,
        product_description: `Import ${IMPORT_SOURCE} · ${r.compania || canonicalCo}${r.cups ? ` · ${r.cups}` : ''}`,
      };

      const { data: saleIns, error: saleErr } = await sb.from('sales').insert(saleRow).select('id').single();
      if (saleErr) {
        report.push(`ERROR_SALE;L${r.lineIndex};${saleErr.message}`);
        salesSkipped++;
        continue;
      }

      const saleId = saleIns.id;
      const { data: line, error: lineErr } = await sb
        .from('sale_lines')
        .insert({
          sale_id: saleId,
          quantity: 1,
          unit_price: r.euros,
          financiada: false,
          transferencia: false,
          nulo: false,
        })
        .select('id')
        .single();

      if (lineErr) {
        report.push(`ERROR_SALE_LINE;L${r.lineIndex};${lineErr.message}`);
        continue;
      }

      const { error: prodErr } = await sb.from('sale_lines_products').insert({
        sale_line_id: line.id,
        product_name: `Importación CSV — ${canonicalCo}${r.tipoEnergy ? ` (${r.tipoEnergy})` : ''}`,
      });
      if (prodErr) {
        report.push(`ERROR_SALE_PRODUCT;L${r.lineIndex};${prodErr.message}`);
        continue;
      }

      salesCreated++;
    }
  }

  const reportPath = join(process.cwd(), 'csvs', `import-report-${importBatchId}.txt`);
  writeFileSync(
    reportPath,
    [
      `import_batch_id=${importBatchId}`,
      `clients_created=${clientsCreated}`,
      `supplies_created=${suppliesCreated}`,
      `supplies_skipped_dup=${suppliesSkippedDup}`,
      `sales_created=${salesCreated}`,
      `sales_skipped=${salesSkipped}`,
      '',
      ...report,
    ].join('\n'),
    'utf8',
  );

  console.log('Listo:', reportPath);
  console.log({
    importBatchId,
    clientsCreated,
    suppliesCreated,
    suppliesSkippedDup,
    salesCreated,
    salesSkipped,
  });
  if (clientsCreated === 0 && suppliesCreated === 0 && salesCreated === 0) {
    console.error(
      '\nNada se insertó. Revisa el informe (líneas ERROR_*). En SQL Editor:\n  SELECT count(*) FROM public.clients WHERE import_source = \'ventas_tulavita_csv\';\n',
    );
  } else {
    console.log(
      '\nSolo este lote:\n  SELECT id, nombre_apellidos, import_batch_id FROM public.clients WHERE import_batch_id = \'' +
        importBatchId +
        '\';',
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
