/**
 * Genera src/constants/comercializadoras-espana.ts a partir del volcado del censo CNMC
 * (comercializadoras de electricidad). Ejecutar tras actualizar scripts/data/cnmc-*.txt
 *
 *   node scripts/build-comercializadoras.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const snapshotPath = path.join(
  root,
  'scripts/data/cnmc-comercializadoras-electricidad-snapshot.txt',
);
const outPath = path.join(root, 'src/constants/comercializadoras-espana.ts');

/** Marcas habituales primero (nombre oficial CNMC si está en el censo). */
const DESTACADAS = [
  'ENDESA ENERGÍA S.A.U.',
  'IBERDROLA CLIENTES, S.A.U.',
  'NATURGY CLIENTES, S.A.U.',
  'NATURGY IBERIA, S.A.',
  'REPSOL COMERCIALIZADORA DE ELECTRICIDAD Y GAS, S.L.U',
  'TOTALENERGIES CLIENTES S.A.U.',
  'TOTALENERGIES ELECTRICIDAD Y GAS ESPAÑA, S.A.U.',
  'FACTOR ENERGÍA, S.A.',
  'HOLALUZ-CLIDOM, S.A',
  'OCTOPUS ENERGY ESPAÑA, S.L.U.',
  'AUDAX RENOVABLES, S.A',
];

/** Comercializadoras solicitadas por negocio que pueden no aparecer en un volcado concreto. */
const EXTRAS_MANUALES = ['GANA ENERGÍA COMERCIALIZADORA, S.L.U.'];

function parseNames(raw) {
  const names = new Set();
  for (const line of raw.split('\n')) {
    if (!/^\|\s*R2-\d+\s*\|/.test(line)) continue;
    const parts = line.split('|').map((s) => s.trim());
    const name = parts[2];
    if (!name || name === 'Nombre empresa') continue;
    names.add(name);
  }
  for (const e of EXTRAS_MANUALES) names.add(e);
  return names;
}

function buildOrdered(names) {
  const set = names;
  const seen = new Set();
  const ordered = [];
  for (const d of DESTACADAS) {
    if (set.has(d) && !seen.has(d)) {
      ordered.push(d);
      seen.add(d);
    }
  }
  const rest = [...set]
    .filter((n) => !seen.has(n))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  ordered.push(...rest);
  return ordered;
}

const raw = fs.readFileSync(snapshotPath, 'utf8');
const names = parseNames(raw);
const ordered = buildOrdered(names);

const header = `/**
 * Comercializadoras de electricidad (España): nombres según censo CNMC
 * (listado de comercializadoras), más entradas manuales habituales en campo.
 *
 * Fuente del volcado: scripts/data/cnmc-comercializadoras-electricidad-snapshot.txt
 * Para actualizar: sustituir ese archivo y ejecutar \`node scripts/build-comercializadoras.mjs\`.
 */
`;

const body = `export const COMERCIALIZADORAS_ESPANA: readonly string[] = [\n${ordered
  .map((n) => `  ${JSON.stringify(n)},`)
  .join('\n')}\n];\n`;

fs.writeFileSync(outPath, header + '\n' + body, 'utf8');
console.log(`Escrito ${outPath} (${ordered.length} entradas)`);
