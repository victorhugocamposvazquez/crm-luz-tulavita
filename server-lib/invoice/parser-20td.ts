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
  /** Si devuelve null, se prueba el siguiente patrón. */
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
  { label: 'eni-plenitude', pattern: /ENI\s+PLENITUDE|PLENITUDE\s+IBERIA/i, value: 'Plenitude', confidence: 0.88 },
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

/**
 * CUPS España: ES + 18 o 20 caracteres típicos (16 dígitos + 2 o 4 de control).
 * Recorta 21–22 chars cuando el PDF pega una letra suelta (p. ej. "N" de "Nº").
 */
function normalizeCupsFromCapture(raw: string): string | null {
  const compact = raw.replace(/[\s.-]+/g, '').toUpperCase();
  const idx = compact.indexOf('ES');
  const body = idx >= 0 ? compact.slice(idx) : compact;
  if (!body.startsWith('ES')) return null;
  let rest = body.slice(2);
  if (rest.length < 18 || rest.length > 22 || !/^[0-9A-Z]+$/.test(rest)) return null;
  const digitCount = (rest.match(/\d/g) ?? []).length;
  if (digitCount < 16) return null;

  const valid18 = (s: string) => /^\d{16}[A-Z0-9]{2}$/.test(s);
  const valid20 = (s: string) => /^\d{16}[A-Z0-9]{4}$/.test(s);

  if (rest.length === 18 && valid18(rest)) return `ES${rest}`;
  /** Sufijos tipo "0F" pegados al CUPS 18 chars (Plenitude / OCR). */
  if (rest.length === 20 && valid18(rest.slice(0, 18))) {
    const tail = rest.slice(18);
    if (/^0[A-Z]$/.test(tail)) return `ES${rest.slice(0, 18)}`;
  }
  if (rest.length === 20 && valid20(rest)) return `ES${rest}`;

  if (rest.length >= 21) {
    const t20 = rest.slice(0, 20);
    if (valid20(t20)) return `ES${t20}`;
  }
  if (rest.length >= 19) {
    const t18 = rest.slice(0, 18);
    if (valid18(t18)) return `ES${t18}`;
  }
  if (rest.length === 20 && !valid20(rest)) {
    const t18 = rest.slice(0, 18);
    if (valid18(t18)) return `ES${t18}`;
  }

  if (rest.length >= 18 && rest.length <= 22) return `ES${rest}`;
  return null;
}

const CUPS_PATTERNS: StringPatternSpec[] = [
  {
    label: 'cups-inline',
    pattern: /CUPS[:\s]+(ES[0-9A-Z\s.-]{18,32})\b/i,
    confidence: 0.99,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-identified',
    pattern: /Identificaci[oó]n punto de suministro \(CUPS\):\s*(ES[0-9A-Z\s.-]{18,32})\b/i,
    confidence: 0.99,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-codigo-label',
    pattern: /C[oó]digo\s+CUPS[:\s]+(ES[0-9A-Z\s.-]{18,32})/i,
    confidence: 0.98,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-numero-label',
    pattern: /N[ºo°\.]?\s*CUPS[:\s]+(ES[0-9A-Z\s.-]{18,32})/i,
    confidence: 0.98,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-punto-suministro',
    pattern: /Punto de suministro[:\s]*(?:\n\s*)?(ES[0-9A-Z\s.-]{18,32})/i,
    confidence: 0.96,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-tight-es',
    pattern: /\b(ES\d{16}[A-Z0-9]{2,6})\b/i,
    confidence: 0.97,
    transform: (value) => normalizeCupsFromCapture(value),
  },
  {
    label: 'cups-spaced-groups',
    pattern: /\b(ES\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*[A-Z0-9]{2,6})\b/i,
    confidence: 0.96,
    transform: (value) => normalizeCupsFromCapture(value),
  },
];

function extractCupsField(text: string): ExtractedField<string> {
  const fromPatterns = extractStringField(text, CUPS_PATTERNS);
  if (fromPatterns.value) return fromPatterns;

  const looseRes = [
    /\bES\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*[A-Z0-9]{2,6}\b/gi,
    /\bES\d{16}[A-Z0-9]{2,6}\b/gi,
  ];
  for (const re of looseRes) {
    const r = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) != null) {
      const n = normalizeCupsFromCapture(m[0]);
      if (n) {
        return { value: n, confidence: 0.88, source: 'cups-loose-scan' };
      }
    }
  }
  return emptyField<string>();
}

const PERIOD_PATTERNS: RegExp[] = [
  /PERIODO\s+DE\s+FACTURACI[ÓO]N:?\s*(\d{2}[./-]\d{2}[./-]\d{4})\s*[-–]\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
  /Periodo de facturaci[oó]n(?: elec\.)?:?\s*(?:del\s*)?(\d{2}[./-]\d{2}[./-]\d{4})\s*(?:a|-)\s*(\d{2}[./-]\d{2}[./-]\d{4})/i,
  /Del\s+(\d{2}[./-]\d{2}[./-]\d{4})\s+al\s+(\d{2}[./-]\d{2}[./-]\d{4})/i,
  /Desde\s+(\d{2}[./-]\d{2}[./-]\d{4})\s+hasta\s+(\d{2}[./-]\d{2}[./-]\d{4})/i,
];

/** Cortes antes de datos técnicos cuando titular y potencia van en la misma línea (p. ej. Iberdrola). */
const TITULAR_END_BEFORE_POWER: RegExp[] = [
  /\bPotencia\s+punta\b/i,
  /\bPotencia\s+valle\b/i,
  /\bPotencia\s+P[12]\b/i,
  /\bPotencias\s+contratadas\b/i,
  /\bPeaje\s+de\s+acceso\b/i,
];

const TITULAR_SPECS: BetweenLabelSpec[] = [
  {
    label: 'titular-nombre-cliente',
    startPatterns: [
      /Nombre\s+del\s+cliente[:\s]+/i,
      /Titular\s+del\s+punto\s+de\s+suministro[:\s]+/i,
      /Contratante[:\s]+/i,
    ],
    endPatterns: [
      ...TITULAR_END_BEFORE_POWER,
      /\n/,
      /\bDNI\b/i,
      /CUPS[:\s]/i,
      /N[ºo]\s*de contrato/i,
      /N[ºo]\s*de factura/i,
      /Fecha de emisi[oó]n/i,
      /Direcci[oó]n/i,
      /Domicilio/i,
      /Total factura/i,
    ],
    confidence: 0.91,
    maxChars: 100,
  },
  {
    label: 'titular-cabecera',
    startPatterns: [/Esta es tu factura de luz,\s*/i],
    endPatterns: [
      ...TITULAR_END_BEFORE_POWER,
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
      /Titular[:\s]+(?!Potencia\b)/i,
      /\bCliente\b\s*[:\s]+/i,
    ],
    endPatterns: [
      ...TITULAR_END_BEFORE_POWER,
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

/** Evita que queden restos de potencia/dirección pegados al nombre (misma línea PDF). */
function sanitizeTitularValue(raw: string | null | undefined): string | null {
  const cleaned = cleanCapturedText(raw);
  if (!cleaned) return null;
  const cut = cleaned.split(/\bPotencia\s+(?:punta|valle|P[12])\b/i)[0];
  const cut2 = cut.split(/\bPotencias\s+contratadas\b/i)[0];
  const cut3 = cut2.split(/\bDirecci[oó]n\s+de\s+suministro\b/i)[0];
  const out = cut3.replace(/\s{2,}/g, ' ').trim();
  if (out.length < 2) return null;
  if (!isPlausibleTitularPersonName(out)) return null;
  return out;
}

/** Rechaza cabeceras societarias / basura OCR que a veces matchea como "titular" (Iberdrola, etc.). */
function isPlausibleTitularPersonName(s: string): boolean {
  const t = s.trim();
  if (t.length > 85) return false;
  if (/\bCIF\b/i.test(t)) return false;
  if (/\bS\.\s*A\.?\s*U\.?\b/i.test(t) || /\bS\.\s*L\.?\b/i.test(t)) return false;
  if (/[<>\\]/.test(t)) return false;
  if (/\d{12,}/.test(t)) return false;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits > 8 && digits > t.length * 0.25) return false;
  return true;
}

/**
 * Texto típico que en facturas eléctricas va *después* de la dirección en la misma línea (Endesa, etc.).
 * Frases largas y específicas para no cortar direcciones normales por casualidad.
 */
const DIRECCION_SUMINISTRO_TAIL_MARKERS: RegExp[] = [
  /\s+Contrato de mercado\s+(?:libre|fijo|indexado|t[íi]pico)\b/i,
  /\s+Referencia de contrato de suministro\b/i,
  /\s+Potencias contratadas\s*[:\s]/i,
  /\s+Potencia\s+punta\s*[:\s]/i,
  /\s+Potencia\s+valle\s*[:\s]/i,
  /\s+Fin de contrato de sumin/i,
  /\s+Peaje de acceso\b/i,
  /\s+Contrato\s+ATR\b/i,
  /\s+Caudal\s+contratado\b/i,
];

/**
 * Si el recorte no parece una dirección de suministro razonable, no confiamos en el corte
 * y devolvemos el bloque original (mejor texto largo que uno cortado erróneo).
 */
function isPlausibleDireccionSuministro(s: string): boolean {
  const t = s.trim();
  if (t.length < 8 || t.length > 220) return false;
  if (!/\d/.test(t)) return false;
  const hasCp = /\b\d{5}\b/.test(t);
  const hasComma = t.includes(',');
  if (!hasCp && !hasComma && t.length > 72) return false;
  return true;
}

/** Recorta solo si hay marcador claro y el prefijo supera la comprobación de plausibilidad. */
function trimDireccionSuministroTail(raw: string): string | null {
  const v = raw.replace(/\r/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!v) return null;

  let bestIdx: number | null = null;
  for (const re of DIRECCION_SUMINISTRO_TAIL_MARKERS) {
    const m = v.match(re);
    if (m?.index != null && m.index > 0 && (bestIdx == null || m.index < bestIdx)) {
      bestIdx = m.index;
    }
  }

  if (bestIdx == null) return v;

  const cut = v.slice(0, bestIdx).trim();
  if (!cut || cut.length + 3 >= v.length) return v;
  if (!isPlausibleDireccionSuministro(cut)) return v;

  return cut;
}

const ADDRESS_SPECS: BetweenLabelSpec[] = [
  {
    label: 'direccion-suministro',
    startPatterns: [
      /Direcci[oó]n de suministro[:\s]*/i,
      /Direcci[oó]n suministro[:\s]*/i,
      /Domicilio\s+de\s+suministro[:\s]*/i,
      /Domicilio\s+del\s+suministro[:\s]*/i,
    ],
    endPatterns: [
      /\n/,
      ...DIRECCION_SUMINISTRO_TAIL_MARKERS,
      /Total factura/i,
      /T[eé]rmino fijo/i,
      /Periodo de facturaci[oó]n/i,
      /PERIODO\s+DE\s+FACTURACI/i,
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
  {
    label: 'precio-linea-consumo-kwh',
    pattern: /Consumo(?:\s+total|\s+facturado)?[:\s]+[\d.,]+\s*kWh[^\n]{0,120}?([\d.,]+)\s*(?:€|eur)\s*\/\s*kWh/i,
    confidence: 0.76,
  },
  { label: 'precio-termino-energia', pattern: /T[ée]rmino\s+(?:de\s+)?energ[íi]a[:\s]+([\d.,]+)\s*(?:€|eur)?\s*\/?\s*kWh/i, confidence: 0.74 },
  { label: 'precio-medio-etiqueta', pattern: /[Pp]recio\s+medio[^:]{0,30}:\s*([\d.,]+)\s*(?:€|eur)\s*\/\s*kWh/i, confidence: 0.8 },
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

const CONSUMO_P1_P2_LINE =
  /(?:^|\n)\s*(?:Punta|Llano|Valle|Horas\s+promocionadas|Horas\s+no\s+promocionadas|Energ[íi]a\s+en\s+horas?\s+punta|Energ[íi]a\s+en\s+horas?\s+llano|Energ[íi]a\s+punta|Energ[íi]a\s+valle|Consumo\s+P[12])\s*[:\s]+([\d.,]+)\s*kWh/gim;

function extractConsumosPorPeriodo(text: string): {
  p1: ExtractedField<number>;
  p2: ExtractedField<number>;
  warnings: string[];
} {
  const matches = [...text.matchAll(CONSUMO_P1_P2_LINE)]
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
      p1: { value: matches[0], confidence: 0.55, source: 'consumo-matchall-1ofmany' },
      p2: { value: matches[1], confidence: 0.55, source: 'consumo-matchall-2ofmany' },
      warnings: ['varias líneas de consumo por periodo; se usan las dos primeras reconocidas'],
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
  const cups = extractCupsField(searchText);
  let titular = extractBetweenLabels(searchText, TITULAR_SPECS);
  if (titular.value) {
    const s = sanitizeTitularValue(titular.value);
    titular = s
      ? { value: s, confidence: titular.confidence, source: titular.source }
      : emptyField<string>();
  }
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
      { label: 'precio-consumo-ha-salido', pattern: /consumo\s+ha\s+salido\s+a\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.84 },
      { label: 'precio-medio-ha-salido', pattern: /ha\s+salido\s+a\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.82 },
      { label: 'precio-factura-ha-salido', pattern: /factura\s+el\s+consumo\s+ha\s+salido\s+a\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.83 },
      { label: 'precio-medio', pattern: /precio medio[^:]{0,40}:\s*([\d.,]+)\s*€\/kWh/i, confidence: 0.8 },
      { label: 'precio-medio-loose', pattern: /precio medio.*?([\d.,]+)\s*€\/kWh/i, confidence: 0.76 },
    ]);
  }

  if (
    precioEnergia.value == null
    && consumption.value != null
    && totalFactura.value != null
    && consumption.value > 0
  ) {
    const impl = totalFactura.value / consumption.value;
    if (impl >= 0.05 && impl <= 0.55) {
      precioEnergia = {
        value: Math.round(impl * 1e6) / 1e6,
        confidence: 0.56,
        source: 'implied-total-div-consumo',
      };
    }
  }

  let precioP1Out = precioP1;
  let precioP2Out = precioP2;
  if (
    precioEnergia.value != null
    && precioEnergia.value > 0
    && (precioP1Out.value == null || precioP2Out.value == null)
  ) {
    const fill = precioEnergia.value;
    if (precioP1Out.value == null) {
      precioP1Out = { value: fill, confidence: precioEnergia.confidence * 0.92, source: `${precioEnergia.source}-as-p1` };
    }
    if (precioP2Out.value == null) {
      precioP2Out = { value: fill, confidence: precioEnergia.confidence * 0.92, source: `${precioEnergia.source}-as-p2` };
    }
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
    precioP1: precioP1Out,
    precioP2: precioP2Out,
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
    precio_p1_kwh: precioP1Out.value,
    precio_p2_kwh: precioP2Out.value,
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
