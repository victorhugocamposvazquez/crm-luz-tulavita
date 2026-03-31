import { readFile } from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { parse20TDFromText, parse20TDFromTextDetailed } from './parser-20td.js';

async function extractPdfJsText(relativePath: string): Promise<string> {
  const fileUrl = new URL(relativePath, import.meta.url);
  const data = new Uint8Array(await readFile(fileUrl));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim();
    if (pageText) pages.push(pageText);
  }

  return pages.join('\n');
}

describe('parse20TDFromText', () => {
  it('acepta un texto tipo pdfjs de Endesa con score suficiente', () => {
    const text = `
      Endesa Energía, S.A. Unipersonal.
      DATOS DE LA FACTURA
      Periodo de facturación: del 13/12/2025 a 13/01/2026 (31 días)
      Total 403,15 €
      INFORMACIÓN DEL CONSUMO ELÉCTRICO
      Consumo Total 1.720,611 kWh
      En esta factura el consumo ha salido a 0,157740 €/kWh
      Potencias contratadas: punta-llano 9,200 kW; valle 9,200 kW
      CUPS: ES0033770112510001LD0F
      Peaje de transporte y distribución: 2.0TD
    `;

    const result = parse20TDFromTextDetailed(text);

    expect(result.diagnostics.accepted).toBe(true);
    expect(result.diagnostics.score).toBeGreaterThanOrEqual(0.78);
    expect(result.extraction).not.toBeNull();
    expect(result.extraction?.company_name).toBe('Endesa Energía');
    expect(result.extraction?.total_factura).toBeCloseTo(403.15);
    expect(result.extraction?.consumption_kwh).toBeCloseTo(1720.611);
    expect(result.extraction?.cups).toBe('ES0033770112510001LD0F');
    expect(result.extraction?.potencia_p1_kw).toBeCloseTo(9.2);
    expect(result.extraction?.period_start).toBe('2025-12-13');
    expect(result.extraction?.period_end).toBe('2026-01-13');
  });

  it('acepta el PDF real de Repsol y recorta bien titular y dirección', async () => {
    const result = parse20TDFromTextDetailed(await extractPdfJsText('../../ejemplos-facturas/ejemplo repsol.pdf'));

    expect(result.diagnostics.accepted).toBe(true);
    expect(result.diagnostics.score).toBeGreaterThanOrEqual(0.78);
    expect(result.extraction).not.toBeNull();
    expect(result.extraction?.company_name).toBe('Repsol');
    expect(result.extraction?.titular).toBe('Iria Lozano Fuentes');
    expect(result.extraction?.direccion_suministro).toContain('LU Aldea coiro 28 BAJO Bj 15175');
    expect(result.extraction?.direccion_suministro).not.toContain('Total factura');
    expect(result.extraction?.titular).not.toContain('DNI');
    expect(result.extraction?.titular).not.toContain('Cuenta bancaria');
    expect(result.extraction?.cups).toBe('ES0022000004140388AF1P');
    expect(result.extraction?.total_factura).toBeCloseTo(201.96);
    expect(result.extraction?.consumption_kwh).toBeCloseTo(936.39);
    expect(result.extraction?.period_start).toBe('2025-12-21');
    expect(result.extraction?.period_end).toBe('2026-01-21');
  });

  it('rechaza una factura de gas aunque tenga marca conocida', async () => {
    const result = parse20TDFromTextDetailed(await extractPdfJsText('../../ejemplos-facturas/ejemplo repsol gas.pdf'));

    expect(result.diagnostics.accepted).toBe(false);
    expect(result.extraction).toBeNull();
    expect(result.diagnostics.criticalMissing).toContain('tipo_tarifa');
  });

  it('rechaza un texto parcial aunque detecte tarifa si faltan campos críticos', () => {
    const text = `
      Factura de luz
      Peaje de transporte y distribución 2.0TD
      Periodo de facturación 21/12/2025 - 21/01/2026
      Repsol
    `;

    const result = parse20TDFromTextDetailed(text);

    expect(parse20TDFromText(text)).toBeNull();
    expect(result.diagnostics.accepted).toBe(false);
    expect(result.diagnostics.criticalMissing).toContain('total_factura');
    expect(result.diagnostics.criticalMissing).toContain('consumption_kwh');
    expect(result.diagnostics.criticalMissing).toContain('cups');
  });
});
