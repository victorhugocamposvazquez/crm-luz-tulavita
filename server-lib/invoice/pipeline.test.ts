import { readFile } from 'node:fs/promises';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { parse20TDFromText } from './pipeline.js';

describe('parse20TDFromText', () => {
  it('parsea un texto tipo pdfjs de Endesa manteniendo el fast-path local', () => {
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

    const result = parse20TDFromText(text);

    expect(result).not.toBeNull();
    expect(result?.company_name).toBe('Endesa Energía');
    expect(result?.total_factura).toBeCloseTo(403.15);
    expect(result?.consumption_kwh).toBeCloseTo(1720.611);
    expect(result?.cups).toBe('ES0033770112510001LD0F');
    expect(result?.potencia_p1_kw).toBeCloseTo(9.2);
    expect(result?.period_start).toBe('2025-12-13');
    expect(result?.period_end).toBe('2026-01-13');
  });

  it('recorta correctamente titular y dirección en el PDF real de Repsol', async () => {
    const fileUrl = new URL('../../ejemplos-facturas/ejemplo repsol.pdf', import.meta.url);
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

    const result = parse20TDFromText(pages.join('\n'));

    expect(result).not.toBeNull();
    expect(result?.company_name).toBe('Repsol');
    expect(result?.titular).toBe('Iria Lozano Fuentes');
    expect(result?.direccion_suministro).toContain('LU Aldea coiro 28 BAJO Bj 15175');
    expect(result?.direccion_suministro).not.toContain('Total factura');
    expect(result?.titular).not.toContain('DNI');
    expect(result?.titular).not.toContain('Cuenta bancaria');
    expect(result?.cups).toBe('ES0022000004140388AF1P');
    expect(result?.total_factura).toBeCloseTo(201.96);
    expect(result?.consumption_kwh).toBeCloseTo(936.39);
    expect(result?.period_start).toBe('2025-12-21');
    expect(result?.period_end).toBe('2026-01-21');
  });
});
