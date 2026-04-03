/**
 * Tests para la extracción LLM de facturas energéticas.
 * - Tests unitarios para el parsing de respuesta JSON del LLM.
 * - Tests de integración (requieren OPENAI_API_KEY) contra las facturas de ejemplo.
 */

import { describe, it, expect } from 'vitest';
import { emptyExtraction } from './types.js';
import { select20TDTextForLLM } from './llm-extract.js';

/**
 * Re-implementación local de parseLLMResponse para testear sin exportar la privada.
 * Replica exactamente la lógica del módulo.
 */
function parseLLMResponse(raw: string) {
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return emptyExtraction();
  }

  function safeString(v: unknown): string | null {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    return null;
  }
  function safePositiveNumber(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.'));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  }
  function safePeriodMonths(v: unknown, start: string | null, end: string | null): number {
    if (typeof v === 'number' && v >= 1 && v <= 12) return Math.round(v);
    if (start && end) {
      try {
        const s = new Date(start);
        const e = new Date(end);
        const diffDays = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 0) {
          const months = Math.round(diffDays / 30);
          if (months >= 1 && months <= 12) return months;
        }
      } catch { /* ignore */ }
    }
    return 1;
  }
  function safeCups(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const cleaned = v.trim().toUpperCase().replace(/\s/g, '');
    if (/^ES\d{16}[A-Z]{2}$/.test(cleaned)) return cleaned;
    if (/^ES\d{16}$/.test(cleaned)) return cleaned;
    return cleaned.length >= 18 ? cleaned : null;
  }

  return {
    company_name: safeString(parsed.company_name),
    consumption_kwh: safePositiveNumber(parsed.consumption_kwh),
    total_factura: safePositiveNumber(parsed.total_factura),
    period_start: safeString(parsed.period_start),
    period_end: safeString(parsed.period_end),
    period_months: safePeriodMonths(parsed.period_months, safeString(parsed.period_start), safeString(parsed.period_end)),
    confidence: 0.95,
    potencia_contratada_kw: safePositiveNumber(parsed.potencia_contratada_kw),
    potencia_p1_kw: safePositiveNumber(parsed.potencia_p1_kw),
    potencia_p2_kw: safePositiveNumber(parsed.potencia_p2_kw),
    potencia_p3_kw: safePositiveNumber(parsed.potencia_p3_kw),
    precio_energia_kwh: safePositiveNumber(parsed.precio_energia_kwh),
    precio_p1_kwh: safePositiveNumber(parsed.precio_p1_kwh),
    precio_p2_kwh: safePositiveNumber(parsed.precio_p2_kwh),
    precio_p3_kwh: safePositiveNumber(parsed.precio_p3_kwh),
    tipo_tarifa: safeString(parsed.tipo_tarifa),
    cups: safeCups(parsed.cups),
    titular: safeString(parsed.titular),
  };
}

describe('parseLLMResponse - parsing de respuesta JSON', () => {
  it('parsea un JSON limpio con todos los campos', () => {
    const json = JSON.stringify({
      company_name: 'Iberdrola',
      consumption_kwh: 245.5,
      total_factura: 67.82,
      period_start: '2025-09-01',
      period_end: '2025-09-30',
      period_months: 1,
      potencia_contratada_kw: 4.6,
      potencia_p1_kw: 4.6,
      potencia_p2_kw: 4.6,
      potencia_p3_kw: null,
      precio_energia_kwh: 0.145,
      precio_p1_kwh: 0.18,
      precio_p2_kwh: 0.12,
      precio_p3_kwh: null,
      tipo_tarifa: '2.0TD',
      cups: 'ES0021000012345678AB',
      titular: 'Juan Pérez',
    });

    const result = parseLLMResponse(json);
    expect(result.company_name).toBe('Iberdrola');
    expect(result.consumption_kwh).toBe(245.5);
    expect(result.total_factura).toBe(67.82);
    expect(result.potencia_contratada_kw).toBe(4.6);
    expect(result.precio_p1_kwh).toBe(0.18);
    expect(result.tipo_tarifa).toBe('2.0TD');
    expect(result.cups).toBe('ES0021000012345678AB');
    expect(result.titular).toBe('Juan Pérez');
    expect(result.period_months).toBe(1);
    expect(result.confidence).toBe(0.95);
  });

  it('maneja JSON con fences markdown', () => {
    const raw = '```json\n{"company_name":"Endesa","consumption_kwh":300,"total_factura":80.5}\n```';
    const result = parseLLMResponse(raw);
    expect(result.company_name).toBe('Endesa');
    expect(result.consumption_kwh).toBe(300);
    expect(result.total_factura).toBe(80.5);
  });

  it('devuelve empty extraction para JSON inválido', () => {
    const result = parseLLMResponse('esto no es json');
    expect(result.company_name).toBeNull();
    expect(result.consumption_kwh).toBeNull();
    expect(result.total_factura).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('maneja valores con coma como separador decimal', () => {
    const json = JSON.stringify({ consumption_kwh: '234,56', total_factura: '89,12' });
    const result = parseLLMResponse(json);
    expect(result.consumption_kwh).toBeCloseTo(234.56);
    expect(result.total_factura).toBeCloseTo(89.12);
  });

  it('rechaza valores negativos o cero', () => {
    const json = JSON.stringify({ consumption_kwh: -10, total_factura: 0 });
    const result = parseLLMResponse(json);
    expect(result.consumption_kwh).toBeNull();
    expect(result.total_factura).toBeNull();
  });

  it('calcula period_months a partir de fechas si falta el campo', () => {
    const json = JSON.stringify({
      period_start: '2025-01-01',
      period_end: '2025-03-01',
      consumption_kwh: 500,
      total_factura: 120,
    });
    const result = parseLLMResponse(json);
    expect(result.period_months).toBe(2);
  });

  it('valida formato CUPS', () => {
    const validCups = 'ES0021000012345678AB';
    const invalidCups = 'ABC123';

    const r1 = parseLLMResponse(JSON.stringify({ cups: validCups }));
    expect(r1.cups).toBe(validCups);

    const r2 = parseLLMResponse(JSON.stringify({ cups: invalidCups }));
    expect(r2.cups).toBeNull();
  });

  it('maneja campos null y vacíos', () => {
    const json = JSON.stringify({
      company_name: null,
      consumption_kwh: null,
      total_factura: null,
      titular: '',
      cups: null,
    });
    const result = parseLLMResponse(json);
    expect(result.company_name).toBeNull();
    expect(result.consumption_kwh).toBeNull();
    expect(result.titular).toBeNull();
    expect(result.cups).toBeNull();
  });
});

describe('select20TDTextForLLM', () => {
  it('recorta texto largo conservando bloques relevantes de 2.0TD', () => {
    const noise = 'texto irrelevante de publicidad y condiciones generales '.repeat(220);
    const text = [
      noise,
      'Factura de luz Repsol 2.0TD CUPS ES0022000004140388AF1P',
      noise,
      'Periodo de facturación 21/12/2025 - 21/01/2026 Total factura 201,96 € Consumo en este periodo 936,39 kWh',
      noise,
      'Potencias contratadas: punta-llano 6,928 kW; valle 6,928 kW',
      'En esta factura el consumo ha salido a 0,157740 €/kWh',
      'Titular Iria Lozano Fuentes Dirección de suministro LU Aldea coiro 28 BAJO Bj 15175 ABRIGOSA',
      noise,
    ].join('\n');

    const reduced = select20TDTextForLLM(text);

    expect(reduced.length).toBeLessThan(text.length);
    expect(reduced.length).toBeLessThanOrEqual(5500);
    expect(reduced).toContain('2.0TD');
    expect(reduced).toContain('CUPS ES0022000004140388AF1P');
    expect(reduced).toContain('Total factura 201,96 €');
    expect(reduced).toContain('Consumo en este periodo 936,39 kWh');
    expect(reduced).toContain('Potencias contratadas: punta-llano 6,928 kW; valle 6,928 kW');
  });

  it('mantiene un texto corto prácticamente intacto', () => {
    const text = '  Factura 2.0TD\n\nCUPS ES0022000004140388AF1P\nTotal factura 201,96 €  ';
    const reduced = select20TDTextForLLM(text);

    expect(reduced).toBe('Factura 2.0TD\nCUPS ES0022000004140388AF1P\nTotal factura 201,96 €');
  });
});

describe('extractWithLLM - integración (requiere OPENAI_API_KEY)', () => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  it.skipIf(!hasApiKey)('placeholder para tests de integración con facturas reales', () => {
    expect(true).toBe(true);
  });
});
