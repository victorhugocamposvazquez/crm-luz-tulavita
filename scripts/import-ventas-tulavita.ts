/**
 * Importa csvs/VENTAS TULAVITA.csv (o ruta por argv) en public.clients, client_supply_addresses y sales.
 *
 * Requisitos:
 *   - Migración 20260509180000_csv_import_clients_supply_sales.sql aplicada.
 *   - .env.local: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   - Copiar scripts/config/ventas-tulavita.agentes.example.json → ventas-tulavita.agentes.json (UUIDs reales)
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

function loadDotEnvLocal(): void {
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  const raw = readFileSync(p, 'utf8');
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    process.env[k] = v;
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
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

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
  if (!existsSync(agentPath)) {
    console.error(
      'Crea scripts/config/ventas-tulavita.agentes.json (copia desde .example.json) con UUID de comerciales.',
    );
    if (existsSync(agentExample)) {
      console.error('Plantilla:', agentExample);
    }
    process.exit(1);
  }

  const rawAgents = loadJson<Record<string, string>>(agentPath);
  const agentsMap: AgentMap = {};
  for (const [k, vin] of Object.entries(rawAgents)) {
    if (k.startsWith('_')) continue;
    agentsMap[k.trim().toUpperCase()] = (vin ?? '').trim();
  }
  const defaultCommercial = agentsMap.DEFAULT || null;
  if (!defaultCommercial) {
    console.warn('⚠️  DEFAULT vacío en agentes: las ventas sin agente mapeado se omitirán.');
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

  const sb = createClient<Database>(url, serviceKey);

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

    const commercialId =
      (topAgent && agentsMap[topAgent]) || defaultCommercial || null;

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
        console.error(error);
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

      const canonicalCo = resolveCompanyCanonical(r.compania, companiesCfg.aliases, fallbackCo);
      const companyId = companyIdByName.get(canonicalCo);
      if (!companyId) {
        report.push(`SKIP_SALE;L${r.lineIndex};sin company_id`);
        salesSkipped++;
        continue;
      }

      const saleCommercial =
        (r.agente && agentsMap[r.agente]) || defaultCommercial || commercialId || null;
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
