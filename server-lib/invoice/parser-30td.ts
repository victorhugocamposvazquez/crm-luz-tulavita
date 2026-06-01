/**
 * Parser determinista para facturas 3.0TD (6 periodos) a partir de texto de PDF.
 *
 * Reutiliza los helpers tarifa-agnósticos del parser 2.0TD (total, consumo, CUPS,
 * empresa, periodo, titular, dirección) y añade la extracción por periodos P1–P6
 * (potencias en kW, consumos en kWh y precios en €/kWh).
 *
 * Como en 2.0TD, devuelve diagnósticos con un score; el pipeline solo usa la
 * extracción si `accepted` es true. Si no, cae al camino LLM (convivencia).
 */

import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';
import {
  normalizeSearchText,
  parseSpanishNum,
  emptyField,
  extractNumberField,
  extractCupsField,
  extractBetweenLabels,
  extractPeriodRange,
  detectCompany,
  sanitizeTitularValue,
  safePeriodMonthsFromDates,
  TOTAL_PATTERNS,
  CONSUMPTION_PATTERNS,
  TITULAR_SPECS,
  ADDRESS_SPECS,
  type ExtractedField,
} from './parser-20td.js';

export type Parser30TDCriticalField = 'tipo_tarifa' | 'total_factura' | 'consumption_kwh' | 'cups';

export interface Parser30TDFieldDiagnostic {
  found: boolean;
  confidence: number;
  source: string | null;
}

export interface Parser30TDDiagnostics {
  score: number;
  accepted: boolean;
  criticalMissing: Parser30TDCriticalField[];
  warnings: string[];
  fields: {
    tipo_tarifa: Parser30TDFieldDiagnostic;
    company_name: Parser30TDFieldDiagnostic;
    total_factura: Parser30TDFieldDiagnostic;
    consumption_kwh: Parser30TDFieldDiagnostic;
    cups: Parser30TDFieldDiagnostic;
    period_range: Parser30TDFieldDiagnostic;
    potencias: Parser30TDFieldDiagnostic;
    consumos: Parser30TDFieldDiagnostic;
    precios: Parser30TDFieldDiagnostic;
  };
}

export interface Parse30TDTextResult {
  extraction: InvoiceExtraction | null;
  diagnostics: Parser30TDDiagnostics;
}

const MIN_ACCEPTED_SCORE = 0.74;

const FIELD_WEIGHTS = {
  tipo_tarifa: 0.16,
  total_factura: 0.2,
  consumption_kwh: 0.2,
  cups: 0.18,
  period_range: 0.06,
  company_name: 0.04,
  potencias: 0.06,
  consumos: 0.06,
  precios: 0.04,
} as const;

type PeriodValues = [number | null, number | null, number | null, number | null, number | null, number | null];

function emptyPeriods(): PeriodValues {
  return [null, null, null, null, null, null];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Normalización ligera que NO colapsa los espacios entre dígitos. La usada por el
 * parser 2.0TD (`normalizeSearchText`) une "P1 30" en "P130" y rompería las
 * etiquetas de periodo, así que para las series P1–P6 usamos esta versión.
 */
function normalizeForSeries(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .trim();
}

function detectTarifa30TD(text: string): ExtractedField<'3.0TD'> {
  if (/3[\.\s]?0\s*TD/i.test(text) || /30TD/i.test(text) || /3[\.\s]?0\s*A/i.test(text)) {
    return { value: '3.0TD', confidence: 0.98, source: 'tarifa-3.0td' };
  }
  return emptyField<'3.0TD'>();
}

/**
 * Extrae valores etiquetados por periodo "P1".."P6" seguidos de un número con la
 * unidad indicada. `unit` distingue potencia (kW), consumo (kWh) o precio (€/kWh).
 * Se queda con la primera ocurrencia de cada periodo (las tablas suelen listarlos
 * en orden P1→P6 una sola vez en el bloque relevante).
 */
function extractPeriodSeries(
  text: string,
  unit: 'kW' | 'kWh' | 'eurkwh',
): { values: PeriodValues; count: number } {
  const values = emptyPeriods();

  const unitPattern =
    unit === 'kW'
      ? 'kW(?!h)'
      : unit === 'kWh'
        ? 'kWh'
        : '(?:€|eur)\\s*\\/\\s*kWh';

  const regex = new RegExp(`\\bP\\s?([1-6])\\b[^\\n]{0,40}?([\\d.,]+)\\s*${unitPattern}`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) != null) {
    const period = Number.parseInt(match[1], 10);
    const value = parseSpanishNum(match[2]);
    if (period >= 1 && period <= 6 && value != null && values[period - 1] == null) {
      values[period - 1] = value;
    }
  }

  const count = values.filter((v) => v != null).length;
  return { values, count };
}

function sumPeriods(values: PeriodValues): number | null {
  let sum = 0;
  let any = false;
  for (const v of values) {
    if (v != null && v > 0) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

function toFieldDiagnostic(found: boolean, confidence: number, source: string | null): Parser30TDFieldDiagnostic {
  return { found, confidence, source };
}

function buildDiagnostics(params: {
  tipoTarifa: ExtractedField<'3.0TD'>;
  companyName: ExtractedField<string>;
  totalFactura: ExtractedField<number>;
  consumption: ExtractedField<number>;
  cups: ExtractedField<string>;
  periodRange: ExtractedField<{ start: string; end: string }>;
  potenciasCount: number;
  consumosCount: number;
  preciosCount: number;
  consumosSum: number | null;
  warnings: string[];
}): Parser30TDDiagnostics {
  const potConfidence = clamp(params.potenciasCount / 6);
  const consConfidence = clamp(params.consumosCount / 6);
  const priceConfidence = clamp(params.preciosCount / 3);

  const diagnostics: Parser30TDDiagnostics = {
    score: 0,
    accepted: false,
    criticalMissing: [],
    warnings: [...params.warnings],
    fields: {
      tipo_tarifa: toFieldDiagnostic(params.tipoTarifa.value != null, params.tipoTarifa.confidence, params.tipoTarifa.source),
      company_name: toFieldDiagnostic(params.companyName.value != null, params.companyName.confidence, params.companyName.source),
      total_factura: toFieldDiagnostic(params.totalFactura.value != null, params.totalFactura.confidence, params.totalFactura.source),
      consumption_kwh: toFieldDiagnostic(params.consumption.value != null, params.consumption.confidence, params.consumption.source),
      cups: toFieldDiagnostic(params.cups.value != null, params.cups.confidence, params.cups.source),
      period_range: toFieldDiagnostic(params.periodRange.value != null, params.periodRange.confidence, params.periodRange.source),
      potencias: toFieldDiagnostic(params.potenciasCount > 0, potConfidence, params.potenciasCount > 0 ? 'periodos-kW' : null),
      consumos: toFieldDiagnostic(params.consumosCount > 0, consConfidence, params.consumosCount > 0 ? 'periodos-kWh' : null),
      precios: toFieldDiagnostic(params.preciosCount > 0, priceConfidence, params.preciosCount > 0 ? 'periodos-eurkwh' : null),
    },
  };

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const key = field as keyof Parser30TDDiagnostics['fields'];
    diagnostics.score += diagnostics.fields[key].confidence * weight;
  }

  if (params.totalFactura.value != null && params.consumption.value != null && params.consumption.value > 0) {
    const impliedPrice = params.totalFactura.value / params.consumption.value;
    if (impliedPrice >= 0.05 && impliedPrice <= 0.6) {
      diagnostics.score += 0.05;
    } else {
      diagnostics.warnings.push(`precio implícito total/kWh fuera de rango (${impliedPrice.toFixed(3)} €/kWh)`);
      diagnostics.score -= 0.15;
    }
  }

  if (params.consumosSum != null && params.consumption.value != null && params.consumption.value > 0) {
    const diff = Math.abs(params.consumosSum - params.consumption.value);
    const tolerance = Math.max(10, params.consumption.value * 0.03);
    if (diff <= tolerance) {
      diagnostics.score += 0.03;
    } else {
      diagnostics.warnings.push(`suma consumos P1–P6 (${params.consumosSum}) ≠ consumo total (${params.consumption.value})`);
      diagnostics.score -= 0.05;
    }
  }

  diagnostics.score = roundScore(clamp(diagnostics.score));

  if (!params.tipoTarifa.value) diagnostics.criticalMissing.push('tipo_tarifa');
  if (params.totalFactura.value == null) diagnostics.criticalMissing.push('total_factura');
  if (params.consumption.value == null) diagnostics.criticalMissing.push('consumption_kwh');
  if (params.cups.value == null) diagnostics.criticalMissing.push('cups');

  diagnostics.accepted = diagnostics.criticalMissing.length === 0 && diagnostics.score >= MIN_ACCEPTED_SCORE;
  return diagnostics;
}

export function parse30TDFromTextDetailed(text: string): Parse30TDTextResult {
  const searchText = normalizeSearchText(text);
  const tipoTarifa = detectTarifa30TD(searchText);

  if (!tipoTarifa.value) {
    return {
      extraction: null,
      diagnostics: {
        score: 0,
        accepted: false,
        criticalMissing: ['tipo_tarifa', 'total_factura', 'consumption_kwh', 'cups'],
        warnings: ['no se detecta tarifa 3.0TD en el texto'],
        fields: {
          tipo_tarifa: toFieldDiagnostic(false, 0, null),
          company_name: toFieldDiagnostic(false, 0, null),
          total_factura: toFieldDiagnostic(false, 0, null),
          consumption_kwh: toFieldDiagnostic(false, 0, null),
          cups: toFieldDiagnostic(false, 0, null),
          period_range: toFieldDiagnostic(false, 0, null),
          potencias: toFieldDiagnostic(false, 0, null),
          consumos: toFieldDiagnostic(false, 0, null),
          precios: toFieldDiagnostic(false, 0, null),
        },
      },
    };
  }

  const companyName = detectCompany(searchText);
  const totalFactura = extractNumberField(searchText, TOTAL_PATTERNS);
  const cups = extractCupsField(searchText);
  const periodRange = extractPeriodRange(searchText);

  let titular = extractBetweenLabels(searchText, TITULAR_SPECS);
  if (titular.value) {
    const s = sanitizeTitularValue(titular.value);
    titular = s ? { value: s, confidence: titular.confidence, source: titular.source } : emptyField<string>();
  }
  const direccion = extractBetweenLabels(searchText, ADDRESS_SPECS);

  const seriesText = normalizeForSeries(text);
  const potencias = extractPeriodSeries(seriesText, 'kW');
  const consumos = extractPeriodSeries(seriesText, 'kWh');
  const precios = extractPeriodSeries(seriesText, 'eurkwh');

  const consumosSum = sumPeriods(consumos.values);

  // Consumo total: patrón explícito; si no, suma de periodos.
  let consumption = extractNumberField(searchText, CONSUMPTION_PATTERNS);
  if (consumption.value == null && consumosSum != null) {
    consumption = { value: consumosSum, confidence: 0.7, source: 'suma-consumos-periodo' };
  }

  const diagnostics = buildDiagnostics({
    tipoTarifa,
    companyName,
    totalFactura,
    consumption,
    cups,
    periodRange,
    potenciasCount: potencias.count,
    consumosCount: consumos.count,
    preciosCount: precios.count,
    consumosSum,
    warnings: [],
  });

  if (!diagnostics.accepted) {
    return { extraction: null, diagnostics };
  }

  const periodStart = periodRange.value?.start ?? null;
  const periodEnd = periodRange.value?.end ?? null;

  const extraction: InvoiceExtraction = {
    ...emptyExtraction(),
    company_name: companyName.value,
    consumption_kwh: consumption.value,
    total_factura: totalFactura.value,
    period_start: periodStart,
    period_end: periodEnd,
    period_months: safePeriodMonthsFromDates(periodStart, periodEnd),
    confidence: Math.max(0.8, diagnostics.score),
    potencia_contratada_kw: potencias.values[0],
    potencia_p1_kw: potencias.values[0],
    potencia_p2_kw: potencias.values[1],
    potencia_p3_kw: potencias.values[2],
    potencia_p4_kw: potencias.values[3],
    potencia_p5_kw: potencias.values[4],
    potencia_p6_kw: potencias.values[5],
    precio_p1_kwh: precios.values[0],
    precio_p2_kwh: precios.values[1],
    precio_p3_kwh: precios.values[2],
    precio_p4_kwh: precios.values[3],
    precio_p5_kwh: precios.values[4],
    precio_p6_kwh: precios.values[5],
    consumo_p1_kwh: consumos.values[0],
    consumo_p2_kwh: consumos.values[1],
    consumo_p3_kwh: consumos.values[2],
    consumo_p4_kwh: consumos.values[3],
    consumo_p5_kwh: consumos.values[4],
    consumo_p6_kwh: consumos.values[5],
    tipo_tarifa: '3.0TD',
    cups: cups.value,
    titular: titular.value,
    direccion_suministro: direccion.value,
  };

  return { extraction, diagnostics };
}

export function parse30TDFromText(text: string): InvoiceExtraction | null {
  return parse30TDFromTextDetailed(text).extraction;
}
