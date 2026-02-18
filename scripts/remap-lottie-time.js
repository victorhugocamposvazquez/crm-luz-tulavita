/**
 * Remapea los keyframes del Lottie para que el frame DESENCHUFADO (148) pase a ser el frame 0.
 * Así la animación empieza desenchufada y termina enchufada sin lógica extra en React.
 *
 * Uso: node scripts/remap-lottie-time.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT = path.join(__dirname, '../public/animations/enchufe.json');
const OUTPUT = path.join(__dirname, '../public/animations/enchufe.json');
const TOTAL_FRAMES = 180;
const UNPLUGGED_OLD_FRAME = 148;

function remapTime(t) {
  if (typeof t !== 'number' || !Number.isFinite(t)) return t;
  return (t - UNPLUGGED_OLD_FRAME + TOTAL_FRAMES) % TOTAL_FRAMES;
}

function transformKeyframeTimes(obj) {
  if (Array.isArray(obj)) {
    return obj.map(transformKeyframeTimes);
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {};
    for (const key of Object.keys(obj)) {
      if (key === 't' && typeof obj[key] === 'number' && obj[key] >= 0 && obj[key] <= 300) {
        out[key] = remapTime(obj[key]);
      } else {
        out[key] = transformKeyframeTimes(obj[key]);
      }
    }
    return out;
  }
  return obj;
}

const json = fs.readFileSync(INPUT, 'utf8');
const data = JSON.parse(json);
const transformed = transformKeyframeTimes(data);
fs.writeFileSync(OUTPUT, JSON.stringify(transformed), 'utf8');
console.log('Lottie remapeado: frame', UNPLUGGED_OLD_FRAME, '→ 0. Guardado en', OUTPUT);
