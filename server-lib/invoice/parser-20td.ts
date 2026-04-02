import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';

export type Parser20TDCriticalField = 'tipo_tarifa' | 'total_factura' | 'consumption_kwh' | 'cups';

export interface Parser20TDFieldDiagnostic {
  found: boolean;
  confidence: number;
  source: string | null;
}

export interface Parser20TDDiagnostics {
  score: number;
  accepted: boolean;
  criticalMissing: Parser20TDCriticalField[];
  warnings: string[];
  fields: {
    tipo_tarifa: Parser20TDFieldDiagnostic;
    company_name: Parser20TDFieldDiagnostic;
    total_factura: Parser20TDFieldDiagnostic;
    consumption_kwh: Parser20TDFieldDiagnostic;
    cups: Parser20TDFieldDiagnostic;
    titular: Parser20TDFieldDiagnostic;
    direccion_suministro: Parser20TDFieldDiagnostic;
    period_range: Parser20TDFieldDiagnostic;
    potencia_p1_kw: Parser20TDFieldDiagnostic;
    potencia_p2_kw: Parser20TDFieldDiagnostic;
    precio_energia_kwh: Parser20TDFieldDiagnostic;
    precio_p1_kwh: Parser20TDFieldDiagnostic;
    precio_p2_kwh: Parser20TDFieldDiagnostic;
    consumo_p1_kwh: Parser20TDFieldDiagnostic;
    consumo_p2_kwh: Parser20TDFieldDiagnostic;
  };
}

export interface Parse20TDTextResult {
  extraction: InvoiceExtraction | null;
  diagnostics: Parser20TDDiagnostics;
}

interface ExtractedField<T> {
  value: T | null;
  confidence: number;
  source: string | null;
}

interface NumberPatternSpec {
  label: string;
  pattern: RegExp;
  confidence: number;
}

interface StringPatternSpec {
  label: string;
  pattern: RegExp;
  confidence: number;
  transform?: (value: string) => string | null;
}

interface BetweenLabelSpec {
  label: string;
  startPatterns: RegExp[];
  endPatterns: RegExp[];
  confidence: number;
  maxChars?: number;
  transform?: (value: string) => string | null;
}

const MIN_ACCEPTED_SCORE = 0.78;

const FIELD_WEIGHTS = {
  tipo_tarifa: 0.18,
  total_factura: 0.22,
  consumption_kwh: 0.22,
  cups: 0.20,
  period_range: 0.07,
  company_name: 0.04,
  titular: 0.02,
  direccion_suministro: 0.02,
  potencia_p1_kw: 0.01,
  potencia_p2_kw: 0.01,
  precio_energia_kwh: 0.01,
} as const;

const COMPANY_PATTERNS: Array<{ label: string; pattern: RegExp; value: string; confidence: number }> = [
  { label: 'endesa', pattern: /ENDESA(?:\s+ENERG[ÍI]A)?/i, value: 'Endesa Energía', confidence: 0.9 },
  { label: 'iberdrola', pattern: /IBERDROLA(?:\s+CLIENTES)?/i, value: 'Iberdrola', confidence: 0.9 },
  { label: 'repsol', pattern: /REPSOL/i, value: 'Repsol', confidence: 0.9 },
  { label: 'totalenergies', pattern: /TOTALENERGIES(?:\s+CLIENTES)?/i, value: 'TotalEnergies', confidence: 0.9 },
  { label: 'naturgy', pattern: /NATURGY/i, value: 'Naturgy', confidence: 0.88 },
  { label: 'plenitude', pattern: /PLENITUDE/i, value: 'Plenitude', confidence: 0.88 },
  { label: 'contigo', pattern: /CONTIGO\s+ENERG[ÍI]A/i, value: 'Contigo Energía', confidence: 0.88 },
  { label: 'gaba', pattern: /GABA\s+ENERG[ÍI]A/i, value: 'Gaba Energía', confidence: 0.88 },
  { label: 'gesternova', pattern: /GESTERNOVA/i, value: 'Gesternova', confidence: 0.88 },
];

const TOTAL_PATTERNS: NumberPatternSpec[] = [
  { label: 'total-factura', pattern: /Total factura\s+([\d.,]+)\s*€/i, confidence: 0.98 },
  { label: 'total-importe-factura', pattern: /TOTAL IMPORTE FACTURA\s+([\d.,]+)\s*€/i, confidence: 0.97 },
  { label: 'importe-total', pattern: /IMPORTE TOTAL ELECTRICIDAD \+ TASAS E IMPUESTOS\s+([\d.,]+)\s*€/i, confidence: 0.96 },
  { label: 'cuanto-pagar', pattern: /¿Cuánto tengo que pagar\?\s+([\d.,]+)\s*€/i, confidence: 0.96 },
  { label: 'total-fallback', pattern: /\bTOTAL\s+([\d.,]+)\s*€/i, confidence: 0.84 },
];

const CONSUMPTION_PATTERNS: NumberPatternSpec[] = [
  { label: 'consumo-total', pattern: /Consumo Total\s+([\d.,]+)\s*kWh/i, confidence: 0.98 },
  { label: 'consumo-periodo', pattern: /Consumo en este periodo\s+([\d.,]+)\s*kWh/i, confidence: 0.97 },
  { label: 'tu-consumo-periodo', pattern: /Tu consumo en el periodo facturado ha sido de\s+([\d.,]+)\s*kWh/i, confidence: 0.96 },
  { label: 'total-kwh', pattern: /Total:\s*([\d.,]+)\s*kWh/i, confidence: 0.84 },
  {
    label: 'consumo-grafica-endesa',
    pattern: /Coste en esta factura[\s\S]{0,120}?Consumo[\s\S]{0,40}?Real[\s\S]{0,40}?Media[\s\S]{0,40}?([\d.,]+)\s*kWh/i,
    confidence: 0.8,
  },
];

const CUPS_PATTERNS: StringPatternSpec[] = [
  {
    label: 'cups-inline',
    pattern: /CUPS[:\s]+(ES[0-9A-Z]{16,24})\b/i,
    confidence: 0.99,
    transform: (value) => value.replace(/\s+/g, '').toUpperCase(),
  },
  {
    label: 'cups-identified',
    pattern: /Identificaci[oó]n punto de suministro \(CUPS\):\s*(ES[0-9A-Z]{16,24})\b/i,
    confidence: 0.99,
    transform: (value) => value.replace(/\s+/g, '').toUpperCase(),
  },
];

const PERIOD_PATTERNS = [
  /Periodo de facturaci[oó]n(?: elec\.)?:?\s*(?:del\s*)?(\d{2}[./-]\d{2}[./-]\d{4})\s*(?:a|-)\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
  /PERIODO DE FACTURACI[ÓO]N:\s*(\d{2}[./-]\d{2}[./-]\d{4})\s*-\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
];

const TITULAR_SPECS: BetweenLabelSpec[] = [
  {
    label: 'titular-cabecera',
    startPatterns: [/Esta es tu factura de luz,\s*/i],
    endPatterns: [
      /\n/,
      /\bDNI\b/i,
      /CUPS[:\s]/i,
      /N[ºo]\s*de contrato/i,
      /N[ºo]\s*de factura/i,
      /Fecha de emisi[oó]n/i,
      /Direcci[oó]n de suministro/i,
      /Total factura/i,
    ],
    confidence: 0.93,
    maxChars: 120,
  },
  {
    label: 'titular-label',
    startPatterns: [
      /Nombre y Apellidos del titular[:\s]*/i,
      /Titular del contrato[:\s]*/i,
      /Titular Potencia[:\s]*/i,
      /Cliente[:\s]*/i,
    ],
    endPatterns: [
      /\n/,
      /\bDNI\b/i,
      /Cuenta bancaria/i,
      /CUPS[:\s]/i,
      /N[ºo]\s*de factura/i,
      /Forma de pago/i,
      /Fecha de emisi[oó]n/i,
      /Fecha de cobro/i,
      /Direcci[oó]n de suministro/i,
      /Total factura/i,
    ],
    confidence: 0.9,
    maxChars: 120,
  },
];

/** Corta la dirección cuando en la misma línea del PDF viene el bloque contractual (p. ej. Endesa). */
function trimDireccionSuministroTail(raw: string): string | null {
  const v = raw.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!v) return null;
  const stop =
    /\s+(?:Contrato de mercado|Referencia de contrato(?:\s+de\s+suministro)?|Potencias contratadas|Fin de contrato(?:\s+de\s+sumin)?|Peaje de acceso|Contrato\s+ATR|Caudal\s+contratado)/i;
  const m = v.match(stop);
  if (m?.index != null && m.index > 0) {
    const cut = v.slice(0, m.index).trim();
    return cut || null;
  }
  return v;
}

const ADDRESS_SPECS: BetweenLabelSpec[] = [
  {
    label: 'direccion-suministro',
    startPatterns: [
      /Direcci[oó]n de suministro[:\s]*/i,
      /Direcci[oó]n suministro[:\s]*/i,
    ],
    endPatterns: [
      /\n/,
      /\s+Contrato de mercado/i,
      /\s+Referencia de contrato/i,
      /\s+Potencias contratadas/i,
      /\s+Fin de contrato/i,
      /\s+Peaje de acceso/i,
      /\s+Contrato\s+ATR/i,
      /Total factura/i,
      /T[eé]rmino fijo/i,
      /Periodo de facturaci[oó]n/i,
      /D[ií]as facturados/i,
      /Consumo en este periodo/i,
      /Fecha de cobro/i,
      /N[ºo]\s*de factura/i,
    ],
    confidence: 0.88,
    maxChars: 220,
    transform: (value) => trimDireccionSuministroTail(value),
  },
];

const POWER_P1_PATTERNS: NumberPatternSpec[] = [
  { label: 'potencias-punta-llano', pattern: /Potencias contratadas:\s*punta-llano\s*([\d.,]+)\s*kW/i, confidence: 0.92 },
  { label: 'potencia-punta', pattern: /Potencia punta:\s*([\d.,]+)\s*kW/i, confidence: 0.9 },
  { label: 'potencia-p1', pattern: /Potencia P1:\s*([\d.,]+)/i, confidence: 0.9 },
  { label: 'potencia-contratada-simple', pattern: /Potencia contratada\s*([\d.,]+)\s*kW/i, confidence: 0.7 },
];

const POWER_P2_PATTERNS: NumberPatternSpec[] = [
  { label: 'potencias-valle', pattern: /Potencias contratadas:.*?valle\s*([\d.,]+)\s*kW/i, confidence: 0.92 },
  { label: 'potencia-valle', pattern: /Potencia valle:\s*([\d.,]+)\s*kW/i, confidence: 0.9 },
  { label: 'potencia-p2', pattern: /Potencia P2:\s*([\d.,]+)\s*kW/i, confidence: 0.9 },
];

const PRICE_P1_PATTERNS: NumberPatternSpec[] = [
  { label: 'precio-consumo-generico', pattern: /Consumo\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*(?:Eur|€)\/kWh/i, confidence: 0.72 },
  { label: 'precio-horas-no-promocionadas', pattern: /Horas no promocionadas\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.72 },
];

function emptyField<T>(): ExtractedField<T> {
  return { value: null, confidence: 0, source: null };
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function parseSpanishNum(text: string | null | undefined): number | null {
  if (!text) return null;
  const clean = text.trim().replace(/\s/g, '');
  if (clean === '') return null;
  const normalized = clean.includes(',') && clean.includes('.')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSearchText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(?<=\d)\s+(?=\d)/g, '')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function cleanCapturedText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s:;,.()-]+/, '')
    .trim();
  return cleaned || null;
}

function extractNumberField(text: string, patterns: NumberPatternSpec[]): ExtractedField<number> {
  for (const pattern of patterns) {
    const match = text.match(pattern.pattern);
    const value = parseSpanishNum(match?.[1]);
    if (value != null) {
      return { value, confidence: pattern.confidence, source: pattern.label };
    }
  }
  return emptyField<number>();
}

function extractStringField(text: string, patterns: StringPatternSpec[]): ExtractedField<string> {
  for (const pattern of patterns) {
    const match = text.match(pattern.pattern);
    const raw = cleanCapturedText(match?.[1]);
    const value = raw && pattern.transform ? pattern.transform(raw) : raw;
    if (value) {
      return { value, confidence: pattern.confidence, source: pattern.label };
    }
  }
  return emptyField<string>();
}

function extractBetweenLabels(text: string, specs: BetweenLabelSpec[]): ExtractedField<string> {
  for (const spec of specs) {
    for (const startPattern of spec.startPatterns) {
      const startMatch = text.match(startPattern);
      if (!startMatch || startMatch.index == null) continue;

      const startIndex = startMatch.index + startMatch[0].length;
      const tail = text.slice(startIndex);
      let endIndex = tail.length;

      for (const endPattern of spec.endPatterns) {
        const endMatch = tail.match(endPattern);
        if (endMatch?.index != null && endMatch.index < endIndex) {
          endIndex = endMatch.index;
        }
      }

      const rawValue = tail.slice(0, Math.min(endIndex, spec.maxChars ?? 180));
      const cleaned = cleanCapturedText(spec.transform ? spec.transform(rawValue) : rawValue);
      if (cleaned) {
        return { value: cleaned, confidence: spec.confidence, source: spec.label };
      }
    }
  }
  return emptyField<string>();
}

function detectCompany(text: string): ExtractedField<string> {
  for (const pattern of COMPANY_PATTERNS) {
    if (pattern.pattern.test(text)) {
      return { value: pattern.value, confidence: pattern.confidence, source: pattern.label };
    }
  }
  return emptyField<string>();
}

function detectTarifa20TD(text: string): ExtractedField<'2.0TD'> {
  if (/2[\.\s]?0\s*TD/i.test(text) || /20TD/i.test(text) || /2[\.\s]?0\s*A/i.test(text)) {
    return { value: '2.0TD', confidence: 0.98, source: 'tarifa-2.0td' };
  }
  return emptyField<'2.0TD'>();
}

function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const parts = raw.trim().replace(/\./g, '/').replace(/-/g, '/').split('/');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function safePeriodMonthsFromDates(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  try {
    const s = new Date(start);
    const e = new Date(end);
    const diffDays = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
    if (!Number.isFinite(diffDays) || diffDays < 0) return 1;
    return Math.max(1, Math.round(diffDays / 30));
  } catch {
    return 1;
  }
}

function extractPeriodRange(text: string): ExtractedField<{ start: string; end: string }> {
  for (const pattern of PERIOD_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;
    const start = toIsoDate(match[1]);
    const end = toIsoDate(match[2]);
    if (start && end) {
      return {
        value: { start, end },
        confidence: 0.9,
        source: pattern.source,
      };
    }
  }
  return emptyField<{ start: string; end: string }>();
}

function extractPrecioP2(text: string): ExtractedField<number> {
  const matches = [...text.matchAll(/(?:Consumo|Horas promocionadas|Horas no promocionadas)\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*(?:Eur|€)\/kWh/gi)];
  if (matches.length >= 2) {
    const value = parseSpanishNum(matches[1][1]);
    if (value != null) {
      return { value, confidence: 0.72, source: 'precio-matchall-2' };
    }
  }
  return emptyField<number>();
}

function extractConsumosPorPeriodo(text: string): {
  p1: ExtractedField<number>;
  p2: ExtractedField<number>;
  warnings: string[];
} {
  const matches = [...text.matchAll(/(?:Punta|Llano|Valle|Horas promocionadas|Horas no promocionadas|Consumo)\s*[: ]*([\d.,]+)\s*kWh/gi)]
    .map((match) => parseSpanishNum(match[1]))
    .filter((value): value is number => value != null && value >= 0);

  if (matches.length === 2) {
    return {
      p1: { value: matches[0], confidence: 0.68, source: 'consumo-matchall-1' },
      p2: { value: matches[1], confidence: 0.68, source: 'consumo-matchall-2' },
      warnings: [],
    };
  }

  if (matches.length > 2) {
    return {
      p1: emptyField<number>(),
      p2: emptyField<number>(),
      warnings: ['desglose de consumo por periodo ambiguo; se deja vacío para no inventar P1/P2'],
    };
  }

  return {
    p1: emptyField<number>(),
    p2: emptyField<number>(),
    warnings: [],
  };
}

function toFieldDiagnostic<T>(field: ExtractedField<T>): Parser20TDFieldDiagnostic {
  return {
    found: field.value != null,
    confidence: field.confidence,
    source: field.source,
  };
}

function buildDiagnostics(params: {
  tipoTarifa: ExtractedField<'2.0TD'>;
  companyName: ExtractedField<string>;
  totalFactura: ExtractedField<number>;
  consumption: ExtractedField<number>;
  cups: ExtractedField<string>;
  titular: ExtractedField<string>;
  direccion: ExtractedField<string>;
  periodRange: ExtractedField<{ start: string; end: string }>;
  powerP1: ExtractedField<number>;
  powerP2: ExtractedField<number>;
  precioEnergia: ExtractedField<number>;
  precioP1: ExtractedField<number>;
  precioP2: ExtractedField<number>;
  consumoP1: ExtractedField<number>;
  consumoP2: ExtractedField<number>;
  warnings: string[];
}): Parser20TDDiagnostics {
  const diagnostics: Parser20TDDiagnostics = {
    score: 0,
    accepted: false,
    criticalMissing: [],
    warnings: [...params.warnings],
    fields: {
      tipo_tarifa: toFieldDiagnostic(params.tipoTarifa),
      company_name: toFieldDiagnostic(params.companyName),
      total_factura: toFieldDiagnostic(params.totalFactura),
      consumption_kwh: toFieldDiagnostic(params.consumption),
      cups: toFieldDiagnostic(params.cups),
      titular: toFieldDiagnostic(params.titular),
      direccion_suministro: toFieldDiagnostic(params.direccion),
      period_range: toFieldDiagnostic(params.periodRange),
      potencia_p1_kw: toFieldDiagnostic(params.powerP1),
      potencia_p2_kw: toFieldDiagnostic(params.powerP2),
      precio_energia_kwh: toFieldDiagnostic(params.precioEnergia),
      precio_p1_kwh: toFieldDiagnostic(params.precioP1),
      precio_p2_kwh: toFieldDiagnostic(params.precioP2),
      consumo_p1_kwh: toFieldDiagnostic(params.consumoP1),
      consumo_p2_kwh: toFieldDiagnostic(params.consumoP2),
    },
  };

  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const key = field as keyof typeof FIELD_WEIGHTS;
    const mappedKey = key as keyof Parser20TDDiagnostics['fields'];
    diagnostics.score += diagnostics.fields[mappedKey].confidence * weight;
  }

  if (params.totalFactura.value != null && params.consumption.value != null && params.consumption.value > 0) {
    const impliedPrice = params.totalFactura.value / params.consumption.value;
    if (impliedPrice >= 0.05 && impliedPrice <= 0.5) {
      diagnostics.score += 0.05;
    } else {
      diagnostics.warnings.push(`precio implícito total/kWh fuera de rango (${impliedPrice.toFixed(3)} €/kWh)`);
      diagnostics.score -= 0.18;
    }
  }

  if (params.periodRange.value) {
    const start = new Date(params.periodRange.value.start);
    const end = new Date(params.periodRange.value.end);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (Number.isFinite(days) && days >= 10 && days <= 62) {
      diagnostics.score += 0.03;
    } else {
      diagnostics.warnings.push(`periodo de facturación sospechoso (${days} días)`);
      diagnostics.score -= 0.08;
    }
  }

  if (
    params.consumoP1.value != null
    && params.consumoP2.value != null
    && params.consumption.value != null
    && params.consumption.value > 0
  ) {
    const sum = params.consumoP1.value + params.consumoP2.value;
    const diff = Math.abs(sum - params.consumption.value);
    const tolerance = Math.max(5, params.consumption.value * 0.03);
    if (diff <= tolerance) {
      diagnostics.score += 0.02;
    } else {
      diagnostics.warnings.push(`desglose P1/P2 no cuadra con consumo total (${sum} vs ${params.consumption.value})`);
      diagnostics.score -= 0.07;
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

export function parse20TDFromTextDetailed(text: string): Parse20TDTextResult {
  const searchText = normalizeSearchText(text);
  const tipoTarifa = detectTarifa20TD(searchText);

  if (!tipoTarifa.value) {
    return {
      extraction: null,
      diagnostics: {
        score: 0,
        accepted: false,
        criticalMissing: ['tipo_tarifa', 'total_factura', 'consumption_kwh', 'cups'],
        warnings: ['no se detecta tarifa 2.0TD en el texto'],
        fields: {
          tipo_tarifa: toFieldDiagnostic(tipoTarifa),
          company_name: toFieldDiagnostic(emptyField<string>()),
          total_factura: toFieldDiagnostic(emptyField<number>()),
          consumption_kwh: toFieldDiagnostic(emptyField<number>()),
          cups: toFieldDiagnostic(emptyField<string>()),
          titular: toFieldDiagnostic(emptyField<string>()),
          direccion_suministro: toFieldDiagnostic(emptyField<string>()),
          period_range: toFieldDiagnostic(emptyField<{ start: string; end: string }>()),
          potencia_p1_kw: toFieldDiagnostic(emptyField<number>()),
          potencia_p2_kw: toFieldDiagnostic(emptyField<number>()),
          precio_energia_kwh: toFieldDiagnostic(emptyField<number>()),
          precio_p1_kwh: toFieldDiagnostic(emptyField<number>()),
          precio_p2_kwh: toFieldDiagnostic(emptyField<number>()),
          consumo_p1_kwh: toFieldDiagnostic(emptyField<number>()),
          consumo_p2_kwh: toFieldDiagnostic(emptyField<number>()),
        },
      },
    };
  }

  const companyName = detectCompany(searchText);
  const totalFactura = extractNumberField(searchText, TOTAL_PATTERNS);
  const consumption = extractNumberField(searchText, CONSUMPTION_PATTERNS);
  const cups = extractStringField(searchText, CUPS_PATTERNS);
  const titular = extractBetweenLabels(searchText, TITULAR_SPECS);
  const direccion = extractBetweenLabels(searchText, ADDRESS_SPECS);
  const periodRange = extractPeriodRange(searchText);
  const powerP1 = extractNumberField(searchText, POWER_P1_PATTERNS);
  const powerP2Base = extractNumberField(searchText, POWER_P2_PATTERNS);
  const powerP2 = powerP2Base.value != null
    ? powerP2Base
    : (powerP1.value != null ? { value: powerP1.value, confidence: powerP1.confidence * 0.9, source: powerP1.source } : emptyField<number>());
  const precioP1 = extractNumberField(searchText, PRICE_P1_PATTERNS);
  const precioP2 = extractPrecioP2(searchText);
  const consumoSplit = extractConsumosPorPeriodo(searchText);

  let precioEnergia: ExtractedField<number>;
  if (
    consumption.value != null
    && consumption.value > 0
    && precioP1.value != null
    && precioP2.value != null
    && consumoSplit.p1.value != null
    && consumoSplit.p2.value != null
    && (consumoSplit.p1.value + consumoSplit.p2.value) > 0
  ) {
    precioEnergia = {
      value: (consumoSplit.p1.value * precioP1.value + consumoSplit.p2.value * precioP2.value) / (consumoSplit.p1.value + consumoSplit.p2.value),
      confidence: Math.min(precioP1.confidence, precioP2.confidence, consumoSplit.p1.confidence, consumoSplit.p2.confidence),
      source: 'weighted-period-prices',
    };
  } else {
    precioEnergia = extractNumberField(searchText, [
      { label: 'precio-medio-ha-salido', pattern: /ha salido a\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.82 },
      { label: 'precio-medio', pattern: /precio medio.*?([\d.,]+)\s*€\/kWh/i, confidence: 0.8 },
    ]);
  }

  const diagnostics = buildDiagnostics({
    tipoTarifa,
    companyName,
    totalFactura,
    consumption,
    cups,
    titular,
    direccion,
    periodRange,
    powerP1,
    powerP2,
    precioEnergia,
    precioP1,
    precioP2,
    consumoP1: consumoSplit.p1,
    consumoP2: consumoSplit.p2,
    warnings: consumoSplit.warnings,
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
    confidence: Math.max(0.85, diagnostics.score),
    potencia_contratada_kw: powerP1.value,
    potencia_p1_kw: powerP1.value,
    potencia_p2_kw: powerP2.value,
    precio_energia_kwh: precioEnergia.value,
    precio_p1_kwh: precioP1.value,
    precio_p2_kwh: precioP2.value,
    consumo_p1_kwh: consumoSplit.p1.value,
    consumo_p2_kwh: consumoSplit.p2.value,
    tipo_tarifa: '2.0TD',
    cups: cups.value,
    titular: titular.value,
    direccion_suministro: direccion.value,
  };

  return { extraction, diagnostics };
}

export function parse20TDFromText(text: string): InvoiceExtraction | null {
  return parse20TDFromTextDetailed(text).extraction;
}
