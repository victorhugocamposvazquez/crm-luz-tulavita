import { describe, expect, it } from 'vitest';
import { parse20TDFromTextDetailed } from './parser-20td.js';

function minimal20TDText(overrides: string): string {
  return [
    'Factura 2.0TD',
    'Total factura 100,00 €',
    'Consumo en este periodo 500,00 kWh',
    'Periodo de facturación 01/12/2025 - 31/12/2025',
    overrides,
  ].join('\n');
}

describe('parse20TDFromTextDetailed — titular (Iberdrola / misma línea)', () => {
  it('corta el titular antes de Potencia punta en la misma línea', () => {
    const text = [
      'Factura 2.0TD IBERDROLA',
      'Cliente: MARTIN KAMGA NKENGNE Potencia punta: 2,2 kW Potencia valle: 2,2 kW',
      'Dirección de suministro: CALLE PRUEBA 12, 28001 MADRID',
      'Total factura 38,84 €',
      'Consumo en este periodo 81,00 kWh',
      'Periodo de facturación 01/01/2025 - 31/01/2025',
      'CUPS ES142100616230020030',
    ].join('\n');
    const { extraction } = parse20TDFromTextDetailed(text);
    expect(extraction?.titular).toBe('MARTIN KAMGA NKENGNE');
    expect(extraction?.direccion_suministro).toMatch(/CALLE PRUEBA/i);
  });
});

describe('parse20TDFromTextDetailed — CUPS', () => {
  it('recorta carácter extra al final del CUPS (p. ej. N pegada)', () => {
    const text = minimal20TDText('CUPS ES0022000004140388AF1PN');
    const { extraction } = parse20TDFromTextDetailed(text);
    expect(extraction?.cups).toBe('ES0022000004140388AF1P');
  });

  it('detecta CUPS en línea con espacios entre grupos', () => {
    const text = minimal20TDText('CUPS: ES 0022 0000 0414 0388 AF1P');
    const { diagnostics, extraction } = parse20TDFromTextDetailed(text);
    expect(diagnostics.fields.cups.found).toBe(true);
    expect(extraction?.cups).toBe('ES0022000004140388AF1P');
  });

  it('detecta CUPS pegado sin etiqueta', () => {
    const text = minimal20TDText('Punto suministro ES0022000004140388AF1P contrato');
    const { diagnostics, extraction } = parse20TDFromTextDetailed(text);
    expect(diagnostics.fields.cups.found).toBe(true);
    expect(extraction?.cups).toBe('ES0022000004140388AF1P');
  });

  it('detecta Código CUPS', () => {
    const text = minimal20TDText('Código CUPS ES0031408122850001AB');
    const { diagnostics, extraction } = parse20TDFromTextDetailed(text);
    expect(diagnostics.fields.cups.found).toBe(true);
    expect(extraction?.cups).toBe('ES0031408122850001AB');
  });
});

describe('parse20TDFromTextDetailed — precios y consumo por periodo (oferta)', () => {
  it('rellena precio medio Repsol y duplica P1/P2 para comparativa', () => {
    const text = [
      'Factura 2.0TD Repsol',
      'Total factura 201,96 €',
      'Consumo en este periodo 936,39 kWh',
      'Horas promocionadas 400,00 kWh',
      'Horas no promocionadas 536,39 kWh',
      'En esta factura el consumo ha salido a 0,157740 €/kWh',
      'Periodo de facturación 21/12/2025 - 21/01/2026',
      'CUPS ES0022000004140388AF1P',
    ].join('\n');
    const { extraction } = parse20TDFromTextDetailed(text);
    expect(extraction?.precio_energia_kwh).toBeCloseTo(0.15774, 5);
    expect(extraction?.precio_p1_kwh).toBeCloseTo(0.15774, 5);
    expect(extraction?.precio_p2_kwh).toBeCloseTo(0.15774, 5);
    expect(extraction?.consumo_p1_kwh).toBe(400);
    expect(extraction?.consumo_p2_kwh).toBeCloseTo(536.39, 2);
  });
});
