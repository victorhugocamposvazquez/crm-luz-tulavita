/**
 * Importa los clientes de `clientes-contratos/Clientes endesa` en public.clients.
 *
 * Estructura esperada:
 *   clientes-contratos/Clientes endesa/<DNI> <NOMBRE> - <Ncontrato>/...archivos
 *   clientes-contratos/Clientes endesa/Agrupados/<ESTADO>/<DNI> <NOMBRE> - <Ncontrato>/...
 *
 * Reglas:
 *   - Un cliente por DNI (se deduplica). Cada contrato del mismo DNI -> punto de
 *     suministro en public.client_supply_addresses.
 *   - La carpeta `Agrupados/<ESTADO>` define el estado comercial de cada contrato.
 *     El cliente recibe como etiquetas (clients.tags) el conjunto de estados de sus
 *     contratos: KO, Liquidado, en trámite, Baja Decomisionable/Decomisionada/No Decomisionable.
 *   - Todos los clientes -> comercializadora = "ENDESA ENERGÍA S.A.U.".
 *   - Los archivos (solo PDF e imágenes) se suben a la ficha del cliente
 *     (public.client_documents, bucket client-documents) clasificados por nombre:
 *       · DNI       -> TIT*, ct* con anv/rev/dni/jt (no contrato/factura), o nombres con dni/anverso/reverso
 *       · Factura   -> FAC*, o ct* que contenga "factura" (marcadas como tramitadas)
 *       · Contrato  -> el resto (EndesaContrato_*, *_ContratoFirmado_*, EMP*, OTR*, escrituras, CIF…)
 *     Los .doc/.docx/.zip y otros formatos no soportados se omiten.
 *
 * Requiere .env.local: SUPABASE_URL (o VITE_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.
 *
 * Uso:
 *   npm run import:clientes-contratos -- --dry-run   # solo informa, no escribe
 *   npm run import:clientes-contratos                # importación real
 *   npm run import:clientes-contratos -- "/ruta/Clientes endesa"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/integrations/supabase/types';

const COMERCIALIZADORA_ENDESA = 'ENDESA ENERGÍA S.A.U.';
const IMPORT_SOURCE = 'clientes_contratos_fs';
const DOCS_BUCKET = 'client-documents';

type DocKind = 'dni' | 'invoice' | 'contract';

// ---------------------------------------------------------------------------
// .env
// ---------------------------------------------------------------------------
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
        '). Inserts en clients/storage suelen fallar por RLS. Usa SUPABASE_SERVICE_ROLE_KEY.\n',
      );
    }
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}

function normalizeDni(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

/** Parsea `DNI NOMBRE - Ncontrato`. Devuelve null si no encaja. */
function parseContractFolder(name: string): { dni: string; nombre: string; contrato: string } | null {
  const m = name.match(/^(\S+)\s+(.+?)\s+-\s+(\d+)\s*$/);
  if (!m) return null;
  return { dni: normalizeDni(m[1]), nombre: normalizeName(m[2]), contrato: m[3].trim() };
}

// Solo PDF e imágenes (igual que el bucket client-documents). El resto se omite.
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Clasifica un archivo en dni | invoice | contract a partir de su nombre.
 * Prioridad: factura (prefijo FAC o "factura") -> DNI (prefijo TIT, o nombres con
 * anv/rev/dni/jt y sin señales de contrato) -> contrato (resto).
 */
function classifyDocument(fileName: string): DocKind {
  const lower = fileName.toLowerCase();
  // Normaliza separadores: el guion bajo cuenta como carácter de palabra y rompe
  // los límites \b (p. ej. "665048_anv"), así que lo tratamos como espacio.
  const norm = lower.replace(/[_]+/g, ' ');

  if (/^fac/.test(lower) || /factura/.test(norm)) return 'invoice';

  // Señales de que el archivo es un contrato/escritura/etc. (gana sobre DNI).
  const contractSignals =
    /(contrato|escritura|escrituras|nombramiento|nonbramiento|acuerdo|traspaso|alquiler|confirmadatos|endesacontrato|contratofirmado|copia simple|constitucion)/.test(
      norm,
    );

  // Señales de DNI / identificación (anverso/reverso del documento).
  const dniSignals = /(^tit|\bdni\b|\btitular\b|\banverso\b|\breverso\b|\banv\b|\brev\b)/.test(norm);

  if (dniSignals && !contractSignals) return 'dni';

  return 'contract';
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    if (n.startsWith('.')) return false;
    try {
      return statSync(join(dir, n)).isDirectory();
    } catch {
      return false;
    }
  });
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    if (n.startsWith('.')) return false;
    try {
      return statSync(join(dir, n)).isFile();
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Tipos de trabajo
// ---------------------------------------------------------------------------
interface ContractInfo {
  contrato: string;
  folderPath: string;
  state: string | null;
}

interface ClientGroup {
  dni: string;
  nombre: string;
  contracts: ContractInfo[];
  tags: string[];
}

interface Stats {
  clientsInserted: number;
  clientsReused: number;
  suppliesInserted: number;
  suppliesSkipped: number;
  filesUploaded: number;
  filesSkipped: number;
  filesError: number;
  docsDni: number;
  docsInvoice: number;
  docsContract: number;
  errors: number;
  report: string[];
}

// ---------------------------------------------------------------------------
// Carga del árbol
// ---------------------------------------------------------------------------
function buildStateMap(baseDir: string): Map<string, string> {
  // folderName (contrato) -> estado
  const map = new Map<string, string>();
  const agrupadosDir = join(baseDir, 'Agrupados');
  for (const state of listDirs(agrupadosDir)) {
    for (const contractFolder of listDirs(join(agrupadosDir, state))) {
      map.set(contractFolder, state);
    }
  }
  return map;
}

function buildClientGroups(baseDir: string): { groups: ClientGroup[]; unparsed: string[] } {
  const stateMap = buildStateMap(baseDir);
  const byDni = new Map<string, ClientGroup>();
  const unparsed: string[] = [];

  for (const folderName of listDirs(baseDir)) {
    if (folderName === 'Agrupados') continue;
    const parsed = parseContractFolder(folderName);
    if (!parsed) {
      unparsed.push(folderName);
      continue;
    }
    const { dni, nombre, contrato } = parsed;
    const state = stateMap.get(folderName) ?? null;
    let group = byDni.get(dni);
    if (!group) {
      group = { dni, nombre, contracts: [], tags: [] };
      byDni.set(dni, group);
    }
    group.contracts.push({ contrato, folderPath: join(baseDir, folderName), state });
  }

  // Derivar tags (estados únicos, orden estable) por cliente.
  for (const group of byDni.values()) {
    const tagSet = new Set<string>();
    for (const c of group.contracts) {
      if (c.state) tagSet.add(c.state);
    }
    group.tags = [...tagSet].sort((a, b) => a.localeCompare(b, 'es'));
  }

  return { groups: [...byDni.values()], unparsed };
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------
function tallyDocKind(stats: Stats, kind: DocKind): void {
  if (kind === 'dni') stats.docsDni++;
  else if (kind === 'invoice') stats.docsInvoice++;
  else stats.docsContract++;
}

async function uploadClientFiles(
  sb: SupabaseClient<Database>,
  clientId: string,
  group: ClientGroup,
  stats: Stats,
  dryRun: boolean,
): Promise<void> {
  // Nombres de archivo ya presentes en la ficha del cliente (dedup en re-ejecuciones).
  const existingNames = new Set<string>();
  const { data: existingDocs } = await sb
    .from('client_documents')
    .select('file_name')
    .eq('client_id', clientId);
  for (const d of (existingDocs ?? []) as { file_name: string | null }[]) {
    if (d.file_name) existingNames.add(d.file_name);
  }

  for (const contract of group.contracts) {
    for (const fileName of listFiles(contract.folderPath)) {
      const ext = extname(fileName).toLowerCase();
      const mime = MIME_BY_EXT[ext];
      if (!mime) {
        stats.filesSkipped++;
        stats.report.push(`SKIP archivo (solo PDF/imagen): ${join(contract.folderPath, fileName)}`);
        continue;
      }
      if (existingNames.has(fileName)) {
        stats.filesSkipped++;
        continue;
      }

      const kind = classifyDocument(fileName);

      if (dryRun) {
        stats.filesUploaded++;
        tallyDocKind(stats, kind);
        existingNames.add(fileName);
        continue;
      }
      try {
        const buffer = readFileSync(join(contract.folderPath, fileName));
        const storagePath = `${clientId}/${kind}/${randomUUID()}${ext}`;
        const { error: upErr } = await sb.storage
          .from(DOCS_BUCKET)
          .upload(storagePath, buffer, { contentType: mime, upsert: false });
        if (upErr) throw upErr;
        const { error: insErr } = await sb.from('client_documents').insert({
          client_id: clientId,
          doc_type: kind,
          storage_path: storagePath,
          file_name: fileName.slice(0, 240),
          mime_type: mime,
          size_bytes: buffer.byteLength,
          processing_status: kind === 'invoice' ? 'processed' : null,
        });
        if (insErr) {
          await sb.storage.from(DOCS_BUCKET).remove([storagePath]);
          throw insErr;
        }
        stats.filesUploaded++;
        tallyDocKind(stats, kind);
        existingNames.add(fileName);
      } catch (e) {
        stats.filesError++;
        const msg = e instanceof Error ? e.message : String(e);
        stats.report.push(`ERROR archivo ${join(contract.folderPath, fileName)}: ${msg}`);
      }
    }
  }
}

async function importGroup(
  sb: SupabaseClient<Database>,
  group: ClientGroup,
  batchId: string,
  stats: Stats,
  dryRun: boolean,
): Promise<void> {
  const externalKey = `clientes_contratos:dni:${group.dni}`;

  // Dedup: primero por import_external_key, luego por DNI.
  let clientId: string | null = null;
  let existingTags: string[] = [];

  const { data: byKey, error: byKeyErr } = await sb
    .from('clients')
    .select('id, tags')
    .eq('import_external_key', externalKey)
    .limit(1);
  if (byKeyErr) throw byKeyErr;
  if (byKey && byKey.length > 0) {
    clientId = byKey[0].id;
    existingTags = byKey[0].tags ?? [];
  } else {
    const { data: byDni, error: byDniErr } = await sb
      .from('clients')
      .select('id, tags')
      .eq('dni', group.dni)
      .limit(1);
    if (byDniErr) throw byDniErr;
    if (byDni && byDni.length > 0) {
      clientId = byDni[0].id;
      existingTags = byDni[0].tags ?? [];
    }
  }

  const mergedTags = [...new Set([...existingTags, ...group.tags])].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );

  if (clientId) {
    stats.clientsReused++;
    if (!dryRun) {
      const { error: updErr } = await sb
        .from('clients')
        .update({ comercializadora: COMERCIALIZADORA_ENDESA, tags: mergedTags })
        .eq('id', clientId);
      if (updErr) throw updErr;
    }
    stats.report.push(
      `REUSE ${group.dni} ${group.nombre} · contratos: ${group.contracts.length} · tags: [${mergedTags.join(', ')}]`,
    );
  } else {
    stats.clientsInserted++;
    if (!dryRun) {
      const { data: created, error: insErr } = await sb
        .from('clients')
        .insert({
          nombre_apellidos: group.nombre,
          direccion: '-',
          dni: group.dni,
          prospect: false,
          status: 'active',
          comercializadora: COMERCIALIZADORA_ENDESA,
          tags: group.tags,
          import_source: IMPORT_SOURCE,
          import_batch_id: batchId,
          import_external_key: externalKey,
          note: `Importado ${IMPORT_SOURCE} · contratos: ${group.contracts
            .map((c) => c.contrato)
            .join(', ')} · lote ${batchId}`,
        })
        .select('id')
        .single();
      if (insErr) throw insErr;
      clientId = created.id;
    }
    stats.report.push(
      `NEW   ${group.dni} ${group.nombre} · contratos: ${group.contracts.length} · tags: [${group.tags.join(', ')}]`,
    );
  }

  if (dryRun) {
    // En dry-run contamos suministros y archivos (clasificados) sin escribir.
    stats.suppliesInserted += group.contracts.length;
    for (const c of group.contracts) {
      for (const fileName of listFiles(c.folderPath)) {
        const ext = extname(fileName).toLowerCase();
        if (MIME_BY_EXT[ext]) {
          stats.filesUploaded++;
          tallyDocKind(stats, classifyDocument(fileName));
        } else {
          stats.filesSkipped++;
        }
      }
    }
    return;
  }

  if (!clientId) return;

  // Puntos de suministro: uno por contrato (dedup por label).
  const { data: existingSupplies } = await sb
    .from('client_supply_addresses')
    .select('label')
    .eq('client_id', clientId);
  const existingLabels = new Set(
    ((existingSupplies ?? []) as { label: string | null }[]).map((s) => s.label ?? ''),
  );

  let sortOrder = existingLabels.size;
  for (const contract of group.contracts) {
    const label = `Contrato Endesa ${contract.contrato}`;
    if (existingLabels.has(label)) {
      stats.suppliesSkipped++;
      continue;
    }
    const noteParts = [`Contrato ${contract.contrato}`];
    if (contract.state) noteParts.push(`estado: ${contract.state}`);
    const { error: supErr } = await sb.from('client_supply_addresses').insert({
      client_id: clientId,
      label,
      note: noteParts.join(' · '),
      sort_order: sortOrder++,
    });
    if (supErr) {
      stats.errors++;
      stats.report.push(`ERROR suministro ${label} (${group.dni}): ${supErr.message}`);
      continue;
    }
    existingLabels.add(label);
    stats.suppliesInserted++;
  }

  // Archivos -> ficha del cliente (client_documents), clasificados por tipo.
  await uploadClientFiles(sb, clientId, group, stats, dryRun);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  loadDotEnvLocal();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pathArg = args.find((a) => !a.startsWith('--'));
  const baseDir =
    pathArg ?? join(process.cwd(), 'clientes-contratos', 'Clientes endesa');

  if (!existsSync(baseDir)) {
    console.error('No existe la carpeta base:', baseDir);
    process.exit(1);
  }

  const { groups, unparsed } = buildClientGroups(baseDir);
  console.log(`Carpeta base: ${baseDir}`);
  console.log(`Clientes (DNIs únicos): ${groups.length}`);
  console.log(`Contratos totales: ${groups.reduce((n, g) => n + g.contracts.length, 0)}`);
  console.log(`Clientes con etiqueta(s): ${groups.filter((g) => g.tags.length > 0).length}`);
  if (unparsed.length) {
    console.warn(`Carpetas que no encajan con el patrón (${unparsed.length}):`);
    for (const u of unparsed) console.warn(`  - ${u}`);
  }

  const stats: Stats = {
    clientsInserted: 0,
    clientsReused: 0,
    suppliesInserted: 0,
    suppliesSkipped: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    filesError: 0,
    docsDni: 0,
    docsInvoice: 0,
    docsContract: 0,
    errors: 0,
    report: [],
  };

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let sb: SupabaseClient<Database> | null = null;
  if (!dryRun) {
    if (!url || !serviceKey) {
      console.error(
        'Faltan variables en .env.local (o .env):\n  SUPABASE_URL (o VITE_SUPABASE_URL)\n  SUPABASE_SERVICE_ROLE_KEY  ← clave service_role',
      );
      process.exit(1);
    }
    warnIfNotServiceRole(serviceKey);
    sb = createClient<Database>(url, serviceKey);
    const { error: probeErr } = await sb.from('clients').select('id', { count: 'exact', head: true });
    if (probeErr) {
      console.error('No se pudo consultar public.clients:', probeErr.message);
      process.exit(1);
    }
  } else {
    // En dry-run usamos un cliente solo si hay credenciales (para dedup real); si no, todo cuenta como nuevo.
    if (url && serviceKey) sb = createClient<Database>(url, serviceKey);
  }

  const batchId = randomUUID();

  for (const group of groups) {
    try {
      if (sb) {
        await importGroup(sb, group, batchId, stats, dryRun);
      } else {
        // dry-run sin credenciales: contar sin tocar la base.
        stats.clientsInserted++;
        stats.suppliesInserted += group.contracts.length;
        for (const c of group.contracts) {
          for (const fileName of listFiles(c.folderPath)) {
            if (MIME_BY_EXT[extname(fileName).toLowerCase()]) {
              stats.filesUploaded++;
              tallyDocKind(stats, classifyDocument(fileName));
            } else {
              stats.filesSkipped++;
            }
          }
        }
        stats.report.push(
          `NEW(dry) ${group.dni} ${group.nombre} · contratos: ${group.contracts.length} · tags: [${group.tags.join(', ')}]`,
        );
      }
    } catch (e) {
      stats.errors++;
      const msg = e instanceof Error ? e.message : String(e);
      stats.report.push(`ERROR cliente ${group.dni} ${group.nombre}: ${msg}`);
      console.error(`ERROR cliente ${group.dni}:`, msg);
    }
  }

  const reportPath = join(
    process.cwd(),
    'csvs',
    `import-clientes-contratos-${dryRun ? 'dryrun-' : ''}${batchId}.txt`,
  );
  try {
    writeFileSync(
      reportPath,
      [
        `base_dir=${baseDir}`,
        `dry_run=${dryRun}`,
        `import_batch_id=${batchId}`,
        `clients_total=${groups.length}`,
        `clients_inserted=${stats.clientsInserted}`,
        `clients_reused=${stats.clientsReused}`,
        `supplies_inserted=${stats.suppliesInserted}`,
        `supplies_skipped=${stats.suppliesSkipped}`,
        `files_uploaded=${stats.filesUploaded}`,
        `files_skipped=${stats.filesSkipped}`,
        `files_error=${stats.filesError}`,
        `docs_dni=${stats.docsDni}`,
        `docs_invoice=${stats.docsInvoice}`,
        `docs_contract=${stats.docsContract}`,
        `errors=${stats.errors}`,
        '',
        ...stats.report,
      ].join('\n'),
      'utf8',
    );
    console.log('Informe:', reportPath);
  } catch (e) {
    console.warn('No se pudo escribir el informe:', e instanceof Error ? e.message : String(e));
  }

  console.log({
    dryRun,
    importBatchId: batchId,
    clientsTotal: groups.length,
    clientsInserted: stats.clientsInserted,
    clientsReused: stats.clientsReused,
    suppliesInserted: stats.suppliesInserted,
    suppliesSkipped: stats.suppliesSkipped,
    filesUploaded: stats.filesUploaded,
    filesSkipped: stats.filesSkipped,
    filesError: stats.filesError,
    docsDni: stats.docsDni,
    docsInvoice: stats.docsInvoice,
    docsContract: stats.docsContract,
    errors: stats.errors,
  });

  if (dryRun) {
    console.log('\n(dry-run) No se ha escrito nada en la base de datos ni en Storage.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
