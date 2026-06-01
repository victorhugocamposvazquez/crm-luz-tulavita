import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse30TDFromTextDetailed } from './parser-30td.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__');

/** Factura 3.0TD sintética con tabla de 6 periodos (potencia/consumo/precio). */
function sample30TDText(): string {
  return [
    'FACTURA DE ELECTRICIDAD 3.0TD ENDESA ENERGÍA',
    'Titular del contrato: COMERCIAL EJEMPLO',
    'Dirección de suministro: CALLE INDUSTRIA 5, 28906 GETAFE',
    'CUPS ES0031408000000001AB0F',
    'PERIODO DE FACTURACIÓN: 01/03/2026 - 31/03/2026',
    'Total factura 1.234,56 €',
    'Consumo Total 6.000,00 kWh',
    'Potencias contratadas:',
    'P1 30,000 kW P2 30,000 kW P3 30,000 kW P4 30,000 kW P5 30,000 kW P6 35,000 kW',
    'Energía consumida por periodo:',
    'P1 1.500,00 kWh P2 1.000,00 kWh P3 800,00 kWh P4 700,00 kWh P5 1.000,00 kWh P6 1.000,00 kWh',
    'Precios energía:',
    'P1 0,150000 €/kWh P2 0,140000 €/kWh P3 0,130000 €/kWh P4 0,120000 €/kWh P5 0,110000 €/kWh P6 0,100000 €/kWh',
  ].join('\n');
}

describe('parse30TDFromTextDetailed — factura 3.0TD completa', () => {
  it('extrae tarifa, total, consumo, CUPS y los 6 periodos', () => {
    const { extraction, diagnostics } = parse30TDFromTextDetailed(sample30TDText());
    expect(diagnostics.accepted).toBe(true);
    expect(extraction).not.toBeNull();
    if (!extraction) return;

    expect(extraction.tipo_tarifa).toBe('3.0TD');
    expect(extraction.total_factura).toBe(1234.56);
    expect(extraction.consumption_kwh).toBe(6000);
    expect(extraction.cups).toBe('ES0031408000000001AB0F');
    expect(extraction.company_name).toBe('Endesa Energía');

    expect(extraction.potencia_p1_kw).toBe(30);
    expect(extraction.potencia_p6_kw).toBe(35);

    expect(extraction.consumo_p1_kwh).toBe(1500);
    expect(extraction.consumo_p3_kwh).toBe(800);

    expect(extraction.precio_p1_kwh).toBeCloseTo(0.15, 5);
    expect(extraction.precio_p6_kwh).toBeCloseTo(0.1, 5);

    expect(extraction.period_start).toBe('2026-03-01');
    expect(extraction.period_end).toBe('2026-03-31');
  });

  it('usa la suma de consumos por periodo si falta el consumo total', () => {
    const text = [
      'FACTURA 3.0TD',
      'Total factura 800,00 €',
      'CUPS ES0031408000000001AB',
      'PERIODO DE FACTURACIÓN: 01/03/2026 - 31/03/2026',
      'P1 1.000,00 kWh P2 1.000,00 kWh P3 1.000,00 kWh P4 0,00 kWh P5 0,00 kWh P6 0,00 kWh',
    ].join('\n');
    const { extraction } = parse30TDFromTextDetailed(text);
    expect(extraction?.consumption_kwh).toBe(3000);
  });

  it('no acepta una factura sin tarifa 3.0TD', () => {
    const { extraction, diagnostics } = parse30TDFromTextDetailed('Factura 2.0TD\nTotal factura 50,00 €');
    expect(extraction).toBeNull();
    expect(diagnostics.accepted).toBe(false);
    expect(diagnostics.criticalMissing).toContain('tipo_tarifa');
  });
});

describe('parse30TDFromTextDetailed — fixture golden Endesa 3.0TD', () => {
  it('cumple los valores golden del fixture de texto', () => {
    const ocr = readFileSync(join(FIXTURES_DIR, 'texts', 'endesa-30td.ocr.txt'), 'utf8');
    const expected = JSON.parse(
      readFileSync(join(FIXTURES_DIR, 'golden', 'endesa-30td.expected.json'), 'utf8'),
    ) as Record<string, unknown>;

    const { extraction, diagnostics } = parse30TDFromTextDetailed(ocr);
    expect(diagnostics.accepted).toBe(true);
    expect(extraction).not.toBeNull();
    if (!extraction) return;

    expect(extraction.tipo_tarifa).toBe(expected.tipo_tarifa);
    expect(extraction.consumption_kwh).toBe(expected.consumption_kwh);
    expect(extraction.total_factura).toBe(expected.total_factura);
    expect(extraction.company_name).toBe(expected.company_name);
    expect(extraction.cups).toBe(expected.cups);
    expect(extraction.period_months).toBe(expected.period_months);
    expect(extraction.potencia_p1_kw).toBe(expected.potencia_p1_kw);
    expect(extraction.potencia_p6_kw).toBe(expected.potencia_p6_kw);
    expect(extraction.consumo_p1_kwh).toBe(expected.consumo_p1_kwh);
    expect(extraction.precio_p1_kwh).toBeCloseTo(expected.precio_p1_kwh as number, 5);
  });
});
