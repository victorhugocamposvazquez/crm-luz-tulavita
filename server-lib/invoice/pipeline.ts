/**
 * Pipeline: obtener archivo → extraer texto (PDF o OCR) → extraer campos.
 */

import type { InvoiceExtraction } from './types.js';
import { extractTextFromPdf } from './pdf-text.js';
import { runDocumentAiOcr } from './document-ai.js';
import { extractFieldsFromText } from './extract-fields.js';

const MIN_TEXT_LENGTH = 80;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function extractInvoiceFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<InvoiceExtraction & { raw_text?: string }> {
  let text = '';
  let confidence = 0.9;

  const isPdf = mimeType === 'application/pdf';
  const isImage = IMAGE_MIMES.has(mimeType);

  if (isPdf) {
    const pdfResult = await extractTextFromPdf(buffer);
    if (pdfResult && pdfResult.text.length >= MIN_TEXT_LENGTH) {
      text = pdfResult.text;
      confidence = 0.92;
    }
  }

  if (!text && (isPdf || isImage)) {
    const ocr = await runDocumentAiOcr(buffer, mimeType);
    if (ocr) {
      text = ocr.text;
      confidence = ocr.confidence;
    }
  }

  if (!text || text.length < 30) {
    return {
      company_name: null,
      consumption_kwh: null,
      total_factura: null,
      period_start: null,
      period_end: null,
      period_months: 1,
      confidence: 0,
      raw_text: text?.slice(0, 500) || undefined,
    };
  }

  const extraction = extractFieldsFromText(text);
  return {
    ...extraction,
    confidence,
    raw_text: extraction.raw_text,
  };
}
