/**
 * Importa csvs/Iberdrola.csv (o ruta por argv) en public.clients y public.client_supply_addresses.
 * La lógica compartida está en `src/lib/clients/iberdrolaImportCore.ts` (misma que la importación desde la UI).
 *
 * Requiere .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   npm run import:iberdrola
 *   npm run import:iberdrola -- ./csvs/otroFichero.csv
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import type { Database } from '../src/integrations/supabase/types';
import {
  type IberdrolaCsvRow,
  mapPapaRowsToIberdrolaParsed,
  runIberdrolaCsvImport,
  validateIberdrolaCsvHeaders,
} from '../src/lib/clients/iberdrolaImportCore';

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
  const parsedCsv = Papa.parse<IberdrolaCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsedCsv.errors.length) {
    const sample = parsedCsv.errors.slice(0, 3).map((e) => `${e.row ?? '?'}: ${e.message}`).join('\n');
    console.warn('Avisos al parsear el CSV (primeros):', sample);
  }

  const headerErr = validateIberdrolaCsvHeaders(parsedCsv.meta.fields);
  if (headerErr) {
    console.error(headerErr);
    process.exit(1);
  }

  const rows = mapPapaRowsToIberdrolaParsed(parsedCsv.data ?? []);
  console.log('Filas detectadas:', rows.length, '(fichero:', csvPath, ')');

  const sb = createClient<Database>(url, serviceKey);

  const { error: probeErr } = await sb.from('clients').select('id', { count: 'exact', head: true });
  if (probeErr) {
    console.error('No se pudo consultar public.clients:', probeErr.message);
    process.exit(1);
  }

  const importBatchId = randomUUID();
  const stats = await runIberdrolaCsvImport(sb, rows, importBatchId);

  const reportPath = join(process.cwd(), 'csvs', `import-iberdrola-${importBatchId}.txt`);
  writeFileSync(
    reportPath,
    [
      `file=${csvPath}`,
      `import_batch_id=${importBatchId}`,
      `rows_in_csv=${rows.length}`,
      `clients_inserted=${stats.clientsInserted}`,
      `clients_reused=${stats.clientsReused}`,
      `supplies_inserted=${stats.suppliesInserted}`,
      `supplies_skipped_same=${stats.suppliesSkippedSame}`,
      `supplies_skipped_other_client=${stats.suppliesSkippedOtherClient}`,
      `skipped_no_client_data=${stats.skippedNoClientData}`,
      `skipped_no_cups=${stats.skippedNoCups}`,
      `errors=${stats.errors}`,
      '',
      ...stats.report,
    ].join('\n'),
    'utf8',
  );

  console.log('Informe:', reportPath);
  console.log({
    importBatchId,
    clientsInserted: stats.clientsInserted,
    clientsReused: stats.clientsReused,
    suppliesInserted: stats.suppliesInserted,
    suppliesSkippedSame: stats.suppliesSkippedSame,
    suppliesSkippedOtherClient: stats.suppliesSkippedOtherClient,
    skippedNoClientData: stats.skippedNoClientData,
    skippedNoCups: stats.skippedNoCups,
    errors: stats.errors,
  });
  if (stats.clientsInserted > 0 || stats.suppliesInserted > 0) {
    console.log(
      `\nVer en SQL Editor:\n  SELECT id, nombre_apellidos, dni, telefono1, localidad FROM public.clients WHERE import_batch_id = '${importBatchId}';\n  SELECT s.client_id, s.cups, s.label, c.nombre_apellidos FROM public.client_supply_addresses s JOIN public.clients c ON c.id = s.client_id WHERE s.note ILIKE '%lote ${importBatchId}%';`,
    );
  } else if (stats.errors > 0) {
    console.error('\nNo se insertó nada. Revisa el informe (líneas ERROR).');
  } else {
    console.log('\nNada nuevo: todo lo del CSV ya estaba en el CRM.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
