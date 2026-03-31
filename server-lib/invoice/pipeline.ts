/**
 * Pipeline de extracción de facturas energéticas.
 *
 * Flujo: caché por hash → si no hay hit, LLM (gpt-4o-mini y opcionalmente gpt-4o) → validación.
 * TTL caché: INVOICE_CACHE_TTL_MS (ms), por defecto 30 min.
 */

import { createHash } from 'crypto';
import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const PROMPT_VERSION = 'v17-client-text-parser';
const extractionCache = new Map<string, { extraction: InvoiceExtraction; ts: number; pv: string }>();
const CACHE_TTL_MS = (() => {
  const n = Number(process.env.INVOICE_CACHE_TTL_MS ?? '');
  return Number.isFinite(n) && n >= 0 ? n : 30 * 60 * 1000;
})();
type LLMExtractModule = typeof import('./llm-extract.js');
let llmExtractModulePromise: Promise<LLMExtractModule> | null = null;

async function loadLLMExtractModule(): Promise<LLMExtractModule> {
  if (!llmExtractModulePromise) llmExtractModulePromise = import('./llm-extract.js');
  return llmExtractModulePromise;
}

export interface InvoiceExtractionDebugMeta {
  cacheHit: boolean;
  providedPdfText: boolean;
  rawDetectedTarifa: '2.0TD' | '3.0TD' | null;
  detectedTarifaAfterPdfParse: '2.0TD' | '3.0TD' | null;
  path:
    | 'cache'
    | '2.0td-raw-parser'
    | '2.0td-text-parser'
    | '2.0td-llm-text'
    | '2.0td-llm-pdf'
    | '3.0td-llm'
    | '3.0td-llm-retry'
    | 'generic-llm'
    | 'generic-llm-retry'
    | 'unsupported'
    | 'empty'
    | 'too-large'
    | 'failed';
  usedPdfParse: boolean;
  usedLLM: boolean;
  usedRetry: boolean;
  timings: {
    totalMs: number;
    pdfParseMs: number | null;
  };
}

export interface InvoiceExtractionDetailedResult {
  extraction: InvoiceExtraction;
  debug: InvoiceExtractionDebugMeta;
}

function fileHash(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}

function extractRawPdfText(buffer: Buffer): string {
  return buffer
    .toString('latin1')
    .replace(/\x00/g, ' ')
    .replace(/[^\n\r\t\x20-\x7E\u00A0-\u00FF]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ');
}

async function extractPdfText(buffer: Buffer): Promise<{ text: string | null; ms: number }> {
  const t0 = Date.now();
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    const text = result.text?.trim();
    const ms = Date.now() - t0;
    console.log(`[pipeline] pdf text extracted in ${ms}ms`);
    return { text: text ? text : null, ms };
  } catch (err) {
    console.warn('[pipeline] PDF text extraction failed:', err instanceof Error ? err.message : err);
    return { text: null, ms: Date.now() - t0 };
  }
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

function firstNumber(text: string, regexes: RegExp[]): number | null {
  for (const regex of regexes) {
    const match = text.match(regex);
    const value = parseSpanishNum(match?.[1]);
    if (value != null) return value;
  }
  return null;
}

function firstString(text: string, regexes: RegExp[]): string | null {
  for (const regex of regexes) {
    const match = text.match(regex);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

function detectCompanyFromText(text: string): string | null {
  const patterns: Array<[RegExp, string]> = [
    [/ENDESA ENERG[ÍI]A/i, 'Endesa Energía'],
    [/IBERDROLA CLIENTES/i, 'Iberdrola'],
    [/REPSOL COMERCIALIZADORA/i, 'Repsol'],
    [/TOTALENERGIES CLIENTES/i, 'TotalEnergies'],
    [/NATURGY/i, 'Naturgy'],
    [/PLENITUDE/i, 'Plenitude'],
    [/CONTIGO ENERG[ÍI]A/i, 'Contigo Energía'],
    [/GABA ENERG[ÍI]A/i, 'Gaba Energía'],
    [/GESTERNOVA/i, 'Gesternova'],
  ];
  for (const [regex, company] of patterns) {
    if (regex.test(text)) return company;
  }
  return null;
}

function normalizeSearchText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/(?<=\d)\s+(?=\d)/g, '')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function parse20TDFromText(text: string): InvoiceExtraction | null {
  const normalized = text.replace(/\r/g, '');
  const searchText = normalizeSearchText(text);
  if (!/2[\.\s]?0\s*TD/i.test(searchText) && !/20TD/i.test(searchText)) return null;

  const company_name = detectCompanyFromText(searchText);
  const total_factura = firstNumber(searchText, [
    /Total factura\s+([\d.,]+)\s*€/i,
    /TOTAL IMPORTE FACTURA\s+([\d.,]+)\s*€/i,
    /IMPORTE TOTAL ELECTRICIDAD \+ TASAS E IMPUESTOS\s+([\d.,]+)\s*€/i,
    /TOTAL\s+([\d.,]+)\s*€/i,
    /¿Cuánto tengo que pagar\?\s+([\d.,]+)\s*€/i,
  ]);
  const consumption_kwh = firstNumber(searchText, [
    /Consumo Total\s+([\d.,]+)\s*kWh/i,
    /Consumo en este periodo\s+([\d.,]+)\s*kWh/i,
    /Tu consumo en el periodo facturado ha sido de\s+([\d.,]+)\s*kWh/i,
    /Total:\s*([\d.,]+)\s*kWh/i,
    /Coste en esta factura[\s\S]{0,120}?Consumo[\s\S]{0,40}?Real[\s\S]{0,40}?Media[\s\S]{0,40}?([\d.,]+)\s*kWh/i,
  ]);
  const cups = firstString(searchText, [
    /CUPS[:\s]+(ES[0-9A-Z]{16,24})\b/i,
    /Identificaci[oó]n punto de suministro \(CUPS\):\s*(ES[0-9A-Z]{16,24})\b/i,
  ])?.replace(/\s+/g, '') ?? null;
  const titular = firstString(normalized, [
    /Titular del contrato:\s*([^\n]+)/i,
    /Nombre y Apellidos del titular\s*([^\n]+)/i,
    /Titular Potencia:\s*([^\n]+)/i,
    /Cliente:\s*([^\n]+)/i,
  ]);
  const periodRange = searchText.match(/Periodo de facturaci[oó]n(?: elec\.)?:?\s*(?:del\s*)?(\d{2}[./-]\d{2}[./-]\d{4})\s*(?:a|-)\s*(\d{2}[./-]\d{2}[./-]\d{4})/i)
    ?? searchText.match(/PERIODO DE FACTURACI[ÓO]N:\s*(\d{2}[./-]\d{2}[./-]\d{4})\s*-\s*(\d{2}[./-]\d{2}[./-]\d{4})/i);
  const period_start = periodRange ? toIsoDate(periodRange[1]) : null;
  const period_end = periodRange ? toIsoDate(periodRange[2]) : null;

  const powerP1 = firstNumber(searchText, [
    /Potencias contratadas:\s*punta-llano\s*([\d.,]+)\s*kW/i,
    /Potencia punta:\s*([\d.,]+)\s*kW/i,
    /Potencia P1:\s*([\d.,]+)/i,
    /Potencia contratada\s*([\d.,]+)kW/i,
  ]);
  const powerP2 = firstNumber(searchText, [
    /Potencias contratadas:.*?valle\s*([\d.,]+)\s*kW/i,
    /Potencia valle:\s*([\d.,]+)\s*kW/i,
    /Potencia P2:\s*([\d.,]+)\s*kW/i,
    /Potencia contratada\s*[\d.,]+kW\s*([\d.,]+)kW/i,
  ]) ?? powerP1;

  const precio_p1_kwh = firstNumber(searchText, [
    /Consumo\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*Eur\/kWh/i,
    /Horas no promocionadas\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*€\/kWh/i,
  ]);
  const precio_p2_kwh = (() => {
    const matches = [...searchText.matchAll(/(?:Consumo|Horas promocionadas|Horas no promocionadas)\s+[\d.,]+\s*kWh\s*x\s*([\d.,]+)\s*(?:Eur|€)\/kWh/gi)];
    if (matches.length >= 2) return parseSpanishNum(matches[1][1]);
    return null;
  })();
  const consumos = [...searchText.matchAll(/(?:Punta|Llano|Valle|Horas promocionadas|Horas no promocionadas|Consumo)\s*[: ]*([\d.,]+)\s*kWh/gi)]
    .map((m) => parseSpanishNum(m[1]))
    .filter((n): n is number => n != null && n >= 0);
  const consumo_p1_kwh = consumos.length >= 2 ? consumos[0] : null;
  const consumo_p2_kwh = consumos.length >= 2 ? consumos[1] : null;

  let precio_energia_kwh: number | null = null;
  if (consumption_kwh && consumption_kwh > 0 && precio_p1_kwh != null && precio_p2_kwh != null && consumo_p1_kwh != null && consumo_p2_kwh != null) {
    precio_energia_kwh = (consumo_p1_kwh * precio_p1_kwh + consumo_p2_kwh * precio_p2_kwh) / (consumo_p1_kwh + consumo_p2_kwh);
  } else {
    precio_energia_kwh = firstNumber(searchText, [
      /ha salido a\s*([\d.,]+)\s*€\/kWh/i,
      /precio medio.*?([\d.,]+)\s*€\/kWh/i,
    ]);
  }

  const direccion_suministro = firstString(normalized, [
    /Direcci[oó]n de suministro:\s*([^\n]+(?:\n[^\n]+)?)/i,
    /Direcci[oó]n suministro\s*([^\n]+)/i,
  ])?.replace(/\n+/g, ' ').trim() ?? null;

  const minOk = total_factura != null && consumption_kwh != null && cups != null;
  if (!minOk) return null;

  return {
    ...emptyExtraction(),
    company_name,
    consumption_kwh,
    total_factura,
    period_start,
    period_end,
    period_months: safePeriodMonthsFromDates(period_start, period_end),
    confidence: 0.92,
    potencia_contratada_kw: powerP1,
    potencia_p1_kw: powerP1,
    potencia_p2_kw: powerP2,
    precio_energia_kwh,
    precio_p1_kwh,
    precio_p2_kwh,
    consumo_p1_kwh,
    consumo_p2_kwh,
    tipo_tarifa: '2.0TD',
    cups,
    titular,
    direccion_suministro,
  };
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

function nullify30TDFields(e: InvoiceExtraction): void {
  e.potencia_p3_kw = null;
  e.potencia_p4_kw = null;
  e.potencia_p5_kw = null;
  e.potencia_p6_kw = null;
  e.precio_p3_kwh = null;
  e.precio_p4_kwh = null;
  e.precio_p5_kwh = null;
  e.precio_p6_kwh = null;
  e.consumo_p3_kwh = null;
  e.consumo_p4_kwh = null;
  e.consumo_p5_kwh = null;
  e.consumo_p6_kwh = null;
}

function normalizeLikely20TD(e: InvoiceExtraction, fixes: string[]): void {
  const rawTarifa = (e.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
  const explicit20 = rawTarifa.includes('2.0') || rawTarifa.includes('20TD') || rawTarifa.includes('20A');
  const noP4ToP6Data = [e.potencia_p4_kw, e.potencia_p5_kw, e.potencia_p6_kw, e.precio_p4_kwh, e.precio_p5_kwh, e.precio_p6_kwh, e.consumo_p4_kwh, e.consumo_p5_kwh, e.consumo_p6_kwh]
    .every((v) => v == null || v === 0);
  const onlyTwoUsefulPrices = [e.precio_p1_kwh, e.precio_p2_kwh, e.precio_p3_kwh, e.precio_p4_kwh, e.precio_p5_kwh, e.precio_p6_kwh]
    .filter((v) => v != null && v > 0).length <= 3;
  const p3LooksCopied = e.potencia_p3_kw != null && e.potencia_p1_kw != null && Math.abs(e.potencia_p3_kw - e.potencia_p1_kw) < 0.001;
  const looks20ByShape = noP4ToP6Data && onlyTwoUsefulPrices && p3LooksCopied;

  if (explicit20 || looks20ByShape) {
    if (e.tipo_tarifa !== '2.0TD') {
      fixes.push(`tipo_tarifa normalizada: ${e.tipo_tarifa ?? 'null'} → 2.0TD`);
      e.tipo_tarifa = '2.0TD';
    }
    nullify30TDFields(e);
  }
}

/**
 * Intenta corregir un consumo que parece estar multiplicado por 1000
 * (error típico del formato decimal español: "714,000" → 714000 en vez de 714).
 */
function tryFixSpanishDecimal(value: number, total: number | null): number | null {
  if (total == null || total <= 0) return null;
  const fixed = value / 1000;
  const impliedPrice = total / fixed;
  if (impliedPrice >= 0.05 && impliedPrice <= 0.50) return fixed;
  return null;
}

/** Corrige inicio 30/11 cuando el periodo es diciembre completo (error frecuente del OCR/LLM). */
function fixPeriodStartEveBeforeMonth(e: InvoiceExtraction, fixes: string[]): void {
  const start = e.period_start;
  const end = e.period_end;
  if (!start || !end) return;
  const mStart = start.match(/^(\d{4})-11-30$/);
  const mEnd = end.match(/^(\d{4})-12-3[01]$/);
  if (mStart && mEnd && mStart[1] === mEnd[1]) {
    const y = mStart[1];
    e.period_start = `${y}-12-01`;
    fixes.push(`period_start: ${start} → ${e.period_start}`);
  }
}

/**
 * Si la suma P1–P6 no cuadra con consumption_kwh (error típico: copiar números de ejemplo del prompt),
 * escala proporcionalmente o anula el desglose si el desvío es enorme.
 */
function reconcileConsumoPorPeriodo(e: InvoiceExtraction, fixes: string[]): void {
  if (e.consumption_kwh == null || e.consumption_kwh <= 0) return;

  const keys = ['consumo_p1_kwh', 'consumo_p2_kwh', 'consumo_p3_kwh', 'consumo_p4_kwh', 'consumo_p5_kwh', 'consumo_p6_kwh'] as const;
  let sum = 0;
  let anyPositive = false;
  for (const k of keys) {
    const v = e[k];
    if (v != null && v > 0) {
      sum += v;
      anyPositive = true;
    }
  }
  if (!anyPositive) return;

  const diff = Math.abs(sum - e.consumption_kwh);
  const tol = Math.max(5, 0.02 * e.consumption_kwh);
  if (diff <= tol) return;

  const rel = diff / e.consumption_kwh;
  if (rel > 0.50) {
    for (const k of keys) {
      (e as Record<string, unknown>)[k] = null;
    }
    fixes.push(
      `consumo P1–P6 anulado: suma periodos ${sum.toFixed(1)} ≠ consumption_kwh ${e.consumption_kwh} (desvío ${(rel * 100).toFixed(0)}%; revisar en factura)`,
    );
    return;
  }

  const factor = e.consumption_kwh / sum;
  for (const k of keys) {
    const v = e[k];
    if (v != null && v > 0) {
      (e as Record<string, unknown>)[k] = Math.round(v * factor * 1000) / 1000;
    }
  }
  fixes.push(
    `consumo por periodo escalado (×${factor.toFixed(4)}) para alinear suma ${sum.toFixed(1)} kWh con consumption_kwh ${e.consumption_kwh}`,
  );
}

/**
 * Si tenemos importe_energia_activa y consumption_kwh, podemos estimar el consumo real:
 * consumo_real ≈ importe_energia_activa / precio_energia_kwh.
 * Si consumption_kwh es mucho menor que esa estimación, faltan bloques.
 */
function crossCheckWithImporteEnergia(e: InvoiceExtraction, warnings: string[]): void {
  if (e.importe_energia_activa == null || e.importe_energia_activa <= 0) return;
  if (e.consumption_kwh == null || e.consumption_kwh <= 0) return;

  const impliedPriceFromImporte = e.importe_energia_activa / e.consumption_kwh;

  if (impliedPriceFromImporte > 0.35 && impliedPriceFromImporte < 1.5) {
    warnings.push(
      `importe_energia_activa (${e.importe_energia_activa.toFixed(2)} €) / consumption_kwh (${e.consumption_kwh}) = ${impliedPriceFromImporte.toFixed(4)} €/kWh — demasiado alto; probablemente falta consumo (bloque temporal no leído).`,
    );
    e.confidence = Math.max(0, e.confidence - 0.15);
  }

  if (e.precio_energia_kwh != null && e.precio_energia_kwh > 0.04 && e.precio_energia_kwh < 0.40) {
    const estimatedConsumption = e.importe_energia_activa / e.precio_energia_kwh;
    const ratio = e.consumption_kwh / estimatedConsumption;
    if (ratio < 0.60) {
      warnings.push(
        `consumption_kwh (${e.consumption_kwh}) es solo ${(ratio * 100).toFixed(0)}% del consumo estimado por importe (${estimatedConsumption.toFixed(0)} kWh = ${e.importe_energia_activa.toFixed(2)} € / ${e.precio_energia_kwh.toFixed(6)} €/kWh). Faltan bloques de energía.`,
      );
      e.confidence = Math.max(0, e.confidence - 0.20);
    }
  }
}

/** precio_energia_kwh = media ponderada por consumo por periodo (no total factura / kWh). */
function recomputeWeightedPrecioEnergia(e: InvoiceExtraction, fixes: string[]): void {
  if (e.consumption_kwh == null || e.consumption_kwh <= 0) return;
  const cs = [
    e.consumo_p1_kwh, e.consumo_p2_kwh, e.consumo_p3_kwh,
    e.consumo_p4_kwh, e.consumo_p5_kwh, e.consumo_p6_kwh,
  ];
  const ps = [
    e.precio_p1_kwh, e.precio_p2_kwh, e.precio_p3_kwh,
    e.precio_p4_kwh, e.precio_p5_kwh, e.precio_p6_kwh,
  ];
  let num = 0;
  let den = 0;
  for (let i = 0; i < 6; i++) {
    const c = cs[i];
    const p = ps[i];
    if (c != null && c > 0 && p != null && p > 0 && p < 1.5) {
      num += c * p;
      den += c;
    }
  }
  if (den <= 0 || num <= 0) return;
  const w = num / den;
  const prev = e.precio_energia_kwh;
  e.precio_energia_kwh = Math.round(w * 1e6) / 1e6;
  if (prev == null || Math.abs(prev - w) > 0.005) {
    fixes.push(`precio_energia_kwh ponderado: ${prev ?? 'null'} → ${e.precio_energia_kwh}`);
  }
}

function validateExtraction(e: InvoiceExtraction): InvoiceExtraction {
  const warnings: string[] = [];
  const fixes: string[] = [];

  if (e.consumption_kwh != null && e.total_factura != null && e.consumption_kwh > 0) {
    const impliedPrice = e.total_factura / e.consumption_kwh;

    if (impliedPrice < 0.01) {
      const fixed = tryFixSpanishDecimal(e.consumption_kwh, e.total_factura);
      if (fixed != null) {
        fixes.push(`consumption_kwh corregido: ${e.consumption_kwh} → ${fixed} (error formato decimal español)`);
        e.consumption_kwh = fixed;
      } else {
        warnings.push(`precio implícito ${impliedPrice.toFixed(4)} €/kWh — consumo probablemente erróneo (${e.consumption_kwh} kWh para ${e.total_factura} €)`);
        e.confidence = Math.max(0, e.confidence - 0.30);
      }
    } else if (impliedPrice < 0.03) {
      warnings.push(`precio implícito bajo: ${impliedPrice.toFixed(4)} €/kWh — revisar consumo`);
      e.confidence = Math.max(0, e.confidence - 0.15);
    } else if (impliedPrice > 2) {
      warnings.push(`precio implícito alto: ${impliedPrice.toFixed(2)} €/kWh — posible error en consumo o total`);
      e.confidence = Math.max(0, e.confidence - 0.10);
    } else if (impliedPrice > 0.48) {
      const t = (e.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
      const is30 = t.includes('3.0') || t.includes('30TD') || t.includes('30A');
      if (is30) {
        warnings.push(
          `total_factura/consumo = ${impliedPrice.toFixed(2)} €/kWh — posible consumo incompleto (¿falta un segundo bloque de energía 3.0TD?). Comparar kWh con el total explícito en la factura.`,
        );
        e.confidence = Math.max(0, e.confidence - 0.12);
      }
    }
  }

  if (e.potencia_contratada_kw != null && e.potencia_contratada_kw > 500) {
    const fixed = e.potencia_contratada_kw / 1000;
    if (fixed >= 1 && fixed <= 500) {
      fixes.push(`potencia_contratada_kw corregida: ${e.potencia_contratada_kw} → ${fixed} (error formato decimal español)`);
      e.potencia_contratada_kw = fixed;
    }
  }
  if (e.potencia_p1_kw != null && e.potencia_p1_kw > 500) {
    const fixed = e.potencia_p1_kw / 1000;
    if (fixed >= 1 && fixed <= 500) {
      fixes.push(`potencia_p1_kw corregida: ${e.potencia_p1_kw} → ${fixed}`);
      e.potencia_p1_kw = fixed;
    }
  }
  if (e.potencia_p2_kw != null && e.potencia_p2_kw > 500) {
    const fixed = e.potencia_p2_kw / 1000;
    if (fixed >= 1 && fixed <= 500) {
      fixes.push(`potencia_p2_kw corregida: ${e.potencia_p2_kw} → ${fixed}`);
      e.potencia_p2_kw = fixed;
    }
  }
  for (const pKey of ['potencia_p3_kw', 'potencia_p4_kw', 'potencia_p5_kw', 'potencia_p6_kw'] as const) {
    const val = e[pKey];
    if (val != null && val > 500) {
      const fixed = val / 1000;
      if (fixed >= 1 && fixed <= 500) {
        fixes.push(`${pKey} corregida: ${val} → ${fixed}`);
        (e as Record<string, unknown>)[pKey] = fixed;
      }
    }
  }

  if (e.consumption_kwh != null && e.consumption_kwh > 100_000) {
    warnings.push(`consumption_kwh extremo: ${e.consumption_kwh}`);
    e.confidence = Math.max(0, e.confidence - 0.20);
  }
  if (e.total_factura != null && e.total_factura < 1) {
    warnings.push(`total_factura sospechosamente bajo: ${e.total_factura}`);
    e.confidence = Math.max(0, e.confidence - 0.15);
  }
  if (e.potencia_contratada_kw != null && e.potencia_contratada_kw > 100) {
    warnings.push(`potencia_contratada_kw alta: ${e.potencia_contratada_kw}`);
    e.confidence = Math.max(0, e.confidence - 0.10);
  }

  if (e.precio_energia_kwh != null && e.precio_energia_kwh > 0.50) {
    const pPrices = [e.precio_p1_kwh, e.precio_p2_kwh, e.precio_p3_kwh, e.precio_p4_kwh, e.precio_p5_kwh, e.precio_p6_kwh]
      .filter((v) => v != null && v > 0 && v < 1) as number[];
    if (pPrices.length >= 2) {
      const avg = pPrices.reduce((a, b) => a + b, 0) / pPrices.length;
      fixes.push(`precio_energia_kwh corregido: ${e.precio_energia_kwh} → ${avg.toFixed(6)} (media de precios por periodo)`);
      e.precio_energia_kwh = avg;
    } else {
      warnings.push(`precio_energia_kwh > 0.50 €/kWh: ${e.precio_energia_kwh}`);
      e.confidence = Math.max(0, e.confidence - 0.15);
    }
  }

  if (e.period_months != null && e.period_months > 3 && e.period_start && e.period_end) {
    try {
      const s = new Date(e.period_start);
      const end = new Date(e.period_end);
      const diffDays = (end.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
      const realMonths = Math.max(1, Math.round(diffDays / 30));
      if (realMonths !== e.period_months && realMonths <= 3) {
        fixes.push(`period_months corregido: ${e.period_months} → ${realMonths} (calculado de fechas ${e.period_start} a ${e.period_end})`);
        e.period_months = realMonths;
      }
    } catch { /* ignore */ }
  }

  fixPeriodStartEveBeforeMonth(e, fixes);
  normalizeLikely20TD(e, fixes);
  crossCheckWithImporteEnergia(e, warnings);
  reconcileConsumoPorPeriodo(e, fixes);
  recomputeWeightedPrecioEnergia(e, fixes);

  if (fixes.length > 0) {
    console.log('[pipeline] Auto-fixes applied:', fixes.join('; '));
  }
  if (warnings.length > 0) {
    console.warn('[pipeline] Validation warnings:', warnings.join('; '));
  }
  return e;
}

/**
 * Intenta detectar la tarifa antes de la extracción completa.
 * Busca "3.0TD", "3.0A", "30TD" en el texto embebido del PDF.
 * Si no puede leer el texto (imagen), devuelve null y se usa el camino 3.0TD (más seguro).
 */
function quickDetectTarifa(text: string | null, buffer: Buffer, mimeType: string): '2.0TD' | '3.0TD' | null {
  const haystack = text && text.trim() !== ''
    ? text
    : (mimeType === 'application/pdf' ? buffer.toString('latin1') : '');

  if (!haystack) return null;

  const has30 = /3[\.\s]?0\s*TD/i.test(haystack) || /30TD/i.test(haystack) || /3[\.\s]?0\s*A/i.test(haystack);
  if (has30) return '3.0TD';

  const has20 = /2[\.\s]?0\s*TD/i.test(haystack) || /20TD/i.test(haystack) || /2[\.\s]?0\s*A/i.test(haystack);
  if (has20) return '2.0TD';

  return null;
}

export async function extractInvoiceFromBufferDetailed(
  buffer: Buffer,
  mimeType: string,
  opts?: { pdfText?: string | null },
): Promise<InvoiceExtractionDetailedResult> {
  const t0 = Date.now();
  const providedPdfText = opts?.pdfText?.trim() ? opts.pdfText.trim() : null;
  const debug: InvoiceExtractionDebugMeta = {
    cacheHit: false,
    providedPdfText: Boolean(providedPdfText),
    rawDetectedTarifa: null,
    detectedTarifaAfterPdfParse: null,
    path: 'failed',
    usedPdfParse: false,
    usedLLM: false,
    usedRetry: false,
    timings: { totalMs: 0, pdfParseMs: null },
  };
  const isPdf = mimeType === 'application/pdf';
  const isImage = IMAGE_MIMES.has(mimeType);

  if (!isPdf && !isImage) {
    console.warn('[pipeline] Unsupported mime:', mimeType);
    debug.path = 'unsupported';
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: emptyExtraction(), debug };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    console.warn('[pipeline] File too large:', buffer.length);
    debug.path = 'too-large';
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: emptyExtraction(), debug };
  }

  if (buffer.length === 0) {
    console.warn('[pipeline] Empty buffer');
    debug.path = 'empty';
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: emptyExtraction(), debug };
  }

  const hash = fileHash(buffer);
  const cached = extractionCache.get(hash);
  if (cached && cached.pv === PROMPT_VERSION && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[pipeline] Cache hit for ${hash} (pv=${cached.pv})`);
    debug.cacheHit = true;
    debug.path = 'cache';
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: cached.extraction, debug };
  }

  const rawPdfText = providedPdfText ?? (mimeType === 'application/pdf' ? extractRawPdfText(buffer) : null);
  const rawDetectedTarifa = quickDetectTarifa(rawPdfText, buffer, mimeType);
  debug.rawDetectedTarifa = rawDetectedTarifa;
  console.log(`[pipeline] Tarifa raw pre-detectada: ${rawDetectedTarifa ?? 'desconocida'}`);

  try {
    let validated: InvoiceExtraction;

    if (rawDetectedTarifa === '2.0TD') {
      const tFast20 = Date.now();
      const rawParsed = rawPdfText ? parse20TDFromText(rawPdfText) : null;
      if (rawParsed) {
        console.log('[pipeline] 2.0TD parsed locally from raw PDF text (sin pdf-parse, sin LLM)');
        debug.path = providedPdfText ? '2.0td-text-parser' : '2.0td-raw-parser';
      }
      const extractedPdf = rawParsed || providedPdfText
        ? null
        : (mimeType === 'application/pdf' ? await extractPdfText(buffer) : null);
      if (extractedPdf) {
        debug.usedPdfParse = true;
        debug.timings.pdfParseMs = extractedPdf.ms;
      }
      const extractedPdfText = providedPdfText ?? extractedPdf?.text ?? null;
      const parsed = rawParsed ?? (extractedPdfText ? parse20TDFromText(extractedPdfText) : null);
      if (!rawParsed && parsed) {
        console.log('[pipeline] 2.0TD parsed locally from pdf-parse text (sin LLM)');
        debug.path = '2.0td-text-parser';
      }
      const extraction = parsed
        ?? (extractedPdfText
          ? await (await loadLLMExtractModule()).extractWithLLM20TDFromText(extractedPdfText)
          : await (await loadLLMExtractModule()).extractWithLLM20TD(buffer, mimeType));
      if (!parsed) {
        debug.usedLLM = true;
        debug.path = extractedPdfText ? '2.0td-llm-text' : '2.0td-llm-pdf';
      }
      validated = validateExtraction(extraction);
      console.log(`[pipeline] 2.0TD path finished in ${Date.now() - tFast20}ms`);
    } else if (rawDetectedTarifa === '3.0TD') {
      const t30 = Date.now();
      let extraction = await (await loadLLMExtractModule()).extractWithLLM30TD(buffer, mimeType);
      debug.usedLLM = true;
      debug.path = '3.0td-llm';
      validated = validateExtraction(extraction);

      if (!validated.consumption_kwh && !validated.total_factura) {
        console.warn('[pipeline] LLM returned no consumption and no total — possible non-energy document');
      }

      if (needs30TDRetry(validated)) {
        console.log('[pipeline] 3.0TD consumo sospechoso — reintentando con gpt-4o forzado');
        const retryExtraction = await (await loadLLMExtractModule()).extractWithLLMForceFull(buffer, mimeType);
        const retryValidated = validateExtraction(retryExtraction);
        debug.usedRetry = true;
        debug.path = '3.0td-llm-retry';

        if (!needs30TDRetry(retryValidated)) {
          console.log('[pipeline] gpt-4o forzado resolvió el consumo incompleto');
          validated = retryValidated;
        } else if (
          retryValidated.consumption_kwh != null && validated.consumption_kwh != null
          && retryValidated.consumption_kwh > validated.consumption_kwh * 1.3
        ) {
          console.log(`[pipeline] gpt-4o forzado extrajo más consumo (${retryValidated.consumption_kwh} vs ${validated.consumption_kwh}), usando retry`);
          validated = retryValidated;
        } else {
          console.log('[pipeline] gpt-4o forzado no mejoró; manteniendo original');
        }
      }
      console.log(`[pipeline] 3.0TD path finished in ${Date.now() - t30}ms`);
    } else {
      const tGeneric = Date.now();
      const extractedPdf = providedPdfText
        ? null
        : (mimeType === 'application/pdf' ? await extractPdfText(buffer) : null);
      if (extractedPdf) {
        debug.usedPdfParse = true;
        debug.timings.pdfParseMs = extractedPdf.ms;
      }
      const extractedPdfText = providedPdfText ?? extractedPdf?.text ?? null;
      const detectedTarifa = quickDetectTarifa(extractedPdfText, buffer, mimeType);
      debug.detectedTarifaAfterPdfParse = detectedTarifa;
      console.log(`[pipeline] Tarifa tras pdf-parse: ${detectedTarifa ?? 'desconocida (usando prompt genérico)'}`);

      if (detectedTarifa === '2.0TD') {
        const parsed = extractedPdfText ? parse20TDFromText(extractedPdfText) : null;
        const extraction = parsed
          ?? (extractedPdfText
            ? await (await loadLLMExtractModule()).extractWithLLM20TDFromText(extractedPdfText)
            : await (await loadLLMExtractModule()).extractWithLLM20TD(buffer, mimeType));
        if (parsed) {
          debug.path = '2.0td-text-parser';
        } else {
          debug.usedLLM = true;
          debug.path = extractedPdfText ? '2.0td-llm-text' : '2.0td-llm-pdf';
        }
        validated = validateExtraction(extraction);
        console.log(`[pipeline] fallback 2.0TD path finished in ${Date.now() - tGeneric}ms`);
        extractionCache.set(hash, { extraction: validated, ts: Date.now(), pv: PROMPT_VERSION });
        console.log(`[pipeline] total ${Date.now() - t0}ms`);
        debug.timings.totalMs = Date.now() - t0;
        return { extraction: validated, debug };
      }

      if (detectedTarifa === '3.0TD') {
        let extraction = await (await loadLLMExtractModule()).extractWithLLM30TD(buffer, mimeType);
        debug.usedLLM = true;
        debug.path = '3.0td-llm';
        validated = validateExtraction(extraction);

        if (needs30TDRetry(validated)) {
          console.log('[pipeline] tarifa detectada por pdf-parse como 3.0TD, retry gpt-4o forzado');
          const retryExtraction = await (await loadLLMExtractModule()).extractWithLLMForceFull(buffer, mimeType);
          const retryValidated = validateExtraction(retryExtraction);
          debug.usedRetry = true;
          debug.path = '3.0td-llm-retry';
          if (!needs30TDRetry(retryValidated) || (retryValidated.confidence ?? 0) >= (validated.confidence ?? 0)) {
            validated = retryValidated;
          }
        }
        console.log(`[pipeline] fallback 3.0TD path finished in ${Date.now() - tGeneric}ms`);
        extractionCache.set(hash, { extraction: validated, ts: Date.now(), pv: PROMPT_VERSION });
        console.log(`[pipeline] total ${Date.now() - t0}ms`);
        debug.timings.totalMs = Date.now() - t0;
        return { extraction: validated, debug };
      }

      const extraction = await (await loadLLMExtractModule()).extractWithLLMGeneric(buffer, mimeType);
      debug.usedLLM = true;
      debug.path = 'generic-llm';
      validated = validateExtraction(extraction);

      if (needs30TDRetry(validated)) {
        console.log('[pipeline] tarifa desconocida, pero consumo parece 3.0TD incompleto — reintentando con gpt-4o forzado');
        const retryExtraction = await (await loadLLMExtractModule()).extractWithLLMForceFull(buffer, mimeType);
        const retryValidated = validateExtraction(retryExtraction);
        debug.usedRetry = true;
        debug.path = 'generic-llm-retry';
        if (!needs30TDRetry(retryValidated) || (retryValidated.confidence ?? 0) >= (validated.confidence ?? 0)) {
          validated = retryValidated;
        }
      }
      console.log(`[pipeline] generic path finished in ${Date.now() - tGeneric}ms`);
    }

    extractionCache.set(hash, { extraction: validated, ts: Date.now(), pv: PROMPT_VERSION });
    console.log(`[pipeline] total ${Date.now() - t0}ms`);
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: validated, debug };
  } catch (err) {
    console.error('[pipeline] Extraction failed:', err instanceof Error ? err.message : err);
    debug.path = 'failed';
    debug.timings.totalMs = Date.now() - t0;
    return { extraction: emptyExtraction(), debug };
  }
}

export async function extractInvoiceFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const { extraction } = await extractInvoiceFromBufferDetailed(buffer, mimeType);
  return extraction;
}

function needs30TDRetry(e: InvoiceExtraction): boolean {
  if (e.consumption_kwh == null || e.consumption_kwh <= 0) return false;
  if (e.total_factura == null || e.total_factura <= 0) return false;
  const t = (e.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
  const is30 = t.includes('3.0') || t.includes('30TD') || t.includes('30A');
  if (!is30) return false;
  const implied = e.total_factura / e.consumption_kwh;
  return implied > 0.47;
}
