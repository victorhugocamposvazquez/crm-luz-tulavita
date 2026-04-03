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
