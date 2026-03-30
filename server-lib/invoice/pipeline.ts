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

function validateExtraction(e: InvoiceExtraction): InvoiceExtraction {
  const warnings: string[] = [];

  if (e.consumption_kwh != null && e.consumption_kwh > 50_000) {
    warnings.push(`consumption_kwh sospechosamente alto: ${e.consumption_kwh}`);
    e.confidence = Math.max(0, e.confidence - 0.15);
  }
  if (e.total_factura != null && e.total_factura > 10_000) {
    warnings.push(`total_factura sospechosamente alto: ${e.total_factura}`);
    e.confidence = Math.max(0, e.confidence - 0.10);
  }
  if (e.total_factura != null && e.total_factura < 1) {
    warnings.push(`total_factura sospechosamente bajo: ${e.total_factura}`);
    e.confidence = Math.max(0, e.confidence - 0.15);
  }
  if (e.potencia_contratada_kw != null && e.potencia_contratada_kw > 100) {
    warnings.push(`potencia_contratada_kw sospechosamente alta: ${e.potencia_contratada_kw}`);
    e.confidence = Math.max(0, e.confidence - 0.10);
  }
  if (e.precio_energia_kwh != null && e.precio_energia_kwh > 1) {
    warnings.push(`precio_energia_kwh > 1 €/kWh: ${e.precio_energia_kwh}`);
    e.confidence = Math.max(0, e.confidence - 0.10);
  }
  if (e.consumption_kwh != null && e.total_factura != null && e.consumption_kwh > 0) {
    const impliedPrice = e.total_factura / e.consumption_kwh;
    if (impliedPrice > 2) {
      warnings.push(`precio implícito ${impliedPrice.toFixed(2)} €/kWh — posible error en consumo o total`);
      e.confidence = Math.max(0, e.confidence - 0.10);
    }
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
