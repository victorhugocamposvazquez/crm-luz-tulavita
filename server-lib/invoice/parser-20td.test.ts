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
