/**
 * Tests de regresión: cada factura tipo (fixture) debe extraer consumo_kwh y total_factura
 * según el golden esperado. Añade fixtures en __fixtures__/golden/*.expected.json y
 * __fixtures__/texts/*.ocr.txt.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { extractFieldsFromText } from './extract-fields.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '__fixtures__');
const GOLDEN_DIR = join(FIXTURES_DIR, 'golden');
const TEXTS_DIR = join(FIXTURES_DIR, 'texts');

const TOLERANCE = 0.02;

interface GoldenExpected {
  consumption_kwh: number;
  total_factura: number;
  company_name: string;
  period_months: number;
}

function getFixtureModels(): string[] {
  if (!existsSync(GOLDEN_DIR)) return [];
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith('.expected.json'))
    .map((f) => f.replace('.expected.json', ''));
}

describe('extractFieldsFromText - regresión por factura tipo', () => {
  const models = getFixtureModels();
  if (models.length === 0) {
    it('no hay fixtures golden aún', () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const model of models) {
    const ocrPath = join(TEXTS_DIR, `${model}.ocr.txt`);
    const goldenPath = join(GOLDEN_DIR, `${model}.expected.json`);

    it(`${model}: extrae consumo, total, compañía y periodo según golden`, () => {
      expect(existsSync(goldenPath), `Golden ${model}.expected.json debe existir`).toBe(true);
      expect(existsSync(ocrPath), `Texto OCR ${model}.ocr.txt debe existir`).toBe(true);

      const golden: GoldenExpected = JSON.parse(readFileSync(goldenPath, 'utf8'));
      const ocrText = readFileSync(ocrPath, 'utf8');
      const result = extractFieldsFromText(ocrText);

      expect(result.consumption_kwh, `consumption_kwh (${model})`).not.toBeNull();
      expect(result.total_factura, `total_factura (${model})`).not.toBeNull();
      expect(result.company_name, `company_name (${model})`).toBeTruthy();
      expect(result.period_months, `period_months (${model})`).toBeGreaterThanOrEqual(1);

      if (result.consumption_kwh != null && golden.consumption_kwh != null) {
        expect(
          Math.abs(result.consumption_kwh - golden.consumption_kwh) <= TOLERANCE,
          `${model} consumption_kwh: esperado ~${golden.consumption_kwh}, obtenido ${result.consumption_kwh}`
        ).toBe(true);
      }
      if (result.total_factura != null && golden.total_factura != null) {
        expect(
          Math.abs(result.total_factura - golden.total_factura) <= TOLERANCE,
          `${model} total_factura: esperado ~${golden.total_factura}, obtenido ${result.total_factura}`
        ).toBe(true);
      }
      if (golden.company_name && result.company_name) {
        expect(
          result.company_name.toLowerCase().includes(golden.company_name.toLowerCase()),
          `${model} company_name: esperado contenga "${golden.company_name}", obtenido "${result.company_name}"`
        ).toBe(true);
      }
      if (golden.period_months != null) {
        expect(result.period_months).toBe(golden.period_months);
      }
    });
  }
});
