/**
 * Pipeline de extracción de facturas energéticas.
 *
 * Flujo: archivo (PDF/imagen) → GPT-4o via Responses API → JSON estructurado.
 * La Responses API acepta PDFs nativamente (extrae texto + renderiza páginas),
 * eliminando la necesidad de conversión previa a imágenes.
 */

import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';
import { extractWithLLM } from './llm-extract.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

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

  try {
    const extraction = await extractWithLLM(buffer, mimeType);

    if (!extraction.consumption_kwh && !extraction.total_factura) {
      console.warn('[pipeline] LLM returned no consumption and no total — possible non-energy document');
    }

    return extraction;
  } catch (err) {
    console.error('[pipeline] Extraction failed:', err instanceof Error ? err.message : err);
    return emptyExtraction();
  }
}
