/**
 * Pipeline de extracción de facturas energéticas.
 *
 * Flujo: hash check → caché hit? → devolver / GPT-4o-mini (×2 paralelo) → merge →
 * validación → si baja confianza → GPT-4o fallback → resultado final.
 */

import { createHash } from 'crypto';
import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';
import { extractWithLLM } from './llm-extract.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const extractionCache = new Map<string, { extraction: InvoiceExtraction; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

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
  if (e.precio_energia_kwh != null && e.precio_energia_kwh > 1) {
    warnings.push(`precio_energia_kwh > 1 €/kWh: ${e.precio_energia_kwh}`);
    e.confidence = Math.max(0, e.confidence - 0.10);
  }

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
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[pipeline] Cache hit for ${hash}`);
    return cached.extraction;
  }

  try {
    const extraction = await extractWithLLM(buffer, mimeType);
    const validated = validateExtraction(extraction);

    if (!validated.consumption_kwh && !validated.total_factura) {
      console.warn('[pipeline] LLM returned no consumption and no total — possible non-energy document');
    }

    extractionCache.set(hash, { extraction: validated, ts: Date.now() });
    return validated;
  } catch (err) {
    console.error('[pipeline] Extraction failed:', err instanceof Error ? err.message : err);
    return emptyExtraction();
  }
}
