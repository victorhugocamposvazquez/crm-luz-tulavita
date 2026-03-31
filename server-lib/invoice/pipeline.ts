/**
 * Pipeline de extracción de facturas energéticas.
 *
 * Flujo: caché por hash → si no hay hit, LLM (gpt-4o-mini y opcionalmente gpt-4o) → validación.
 * TTL caché: INVOICE_CACHE_TTL_MS (ms), por defecto 30 min.
 */

import { createHash } from 'crypto';
import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';
import { extractWithLLM } from './llm-extract.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const PROMPT_VERSION = 'v11-consumo-reconcile-ejemplo-anonimo';
const extractionCache = new Map<string, { extraction: InvoiceExtraction; ts: number; pv: string }>();
const CACHE_TTL_MS = (() => {
  const n = Number(process.env.INVOICE_CACHE_TTL_MS ?? '');
  return Number.isFinite(n) && n >= 0 ? n : 30 * 60 * 1000;
})();

function fileHash(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
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

export async function extractInvoiceFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<InvoiceExtraction> {
  const isPdf = mimeType === 'application/pdf';
  const isImage = IMAGE_MIMES.has(mimeType);

  if (!isPdf && !isImage) {
    console.warn('[pipeline] Unsupported mime:', mimeType);
    return emptyExtraction();
  }

  if (buffer.length > MAX_FILE_SIZE) {
    console.warn('[pipeline] File too large:', buffer.length);
    return emptyExtraction();
  }

  if (buffer.length === 0) {
    console.warn('[pipeline] Empty buffer');
    return emptyExtraction();
  }

  const hash = fileHash(buffer);
  const cached = extractionCache.get(hash);
  if (cached && cached.pv === PROMPT_VERSION && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[pipeline] Cache hit for ${hash} (pv=${cached.pv})`);
    return cached.extraction;
  }

  try {
    const extraction = await extractWithLLM(buffer, mimeType);
    const validated = validateExtraction(extraction);

    if (!validated.consumption_kwh && !validated.total_factura) {
      console.warn('[pipeline] LLM returned no consumption and no total — possible non-energy document');
    }

    extractionCache.set(hash, { extraction: validated, ts: Date.now(), pv: PROMPT_VERSION });
    return validated;
  } catch (err) {
    console.error('[pipeline] Extraction failed:', err instanceof Error ? err.message : err);
    return emptyExtraction();
  }
}
