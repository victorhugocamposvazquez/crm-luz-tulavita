/**
 * Pipeline: obtener archivo → Document AI Invoice Parser (entidades + texto) → extraer campos.
 * Combina entidades del Invoice Parser (total, supplier) con extracción por regex sobre el texto
 * (consumo kWh, periodo) para facturas de luz con distintos formatos.
 */

import type { InvoiceExtraction } from './types.js';
import { runDocumentAiInvoiceParser } from './document-ai.js';
import { extractFieldsFromText, normalizeCompanyName } from './extract-fields.js';

const MIN_TEXT_LENGTH = 30;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function extractInvoiceFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<InvoiceExtraction & { raw_text?: string }> {
  const isPdf = mimeType === 'application/pdf';
  const isImage = IMAGE_MIMES.has(mimeType);

  if (!isPdf && !isImage) {
    return {
      company_name: null,
      consumption_kwh: null,
      total_factura: null,
      period_start: null,
      period_end: null,
      period_months: 1,
      confidence: 0,
    };
  }

  const result = await runDocumentAiInvoiceParser(buffer, mimeType);
  if (!result || !result.text || result.text.length < MIN_TEXT_LENGTH) {
    return {
      company_name: null,
      consumption_kwh: null,
      total_factura: null,
      period_start: null,
      period_end: null,
      period_months: 1,
      confidence: 0,
      raw_text: result?.text?.slice(0, 500) || undefined,
    };
  }

  const fromText = extractFieldsFromText(result.text);
  const entities = result.entities;

  const company_name =
    entities.company_name != null && entities.company_name.trim() !== ''
      ? normalizeCompanyName(entities.company_name)
      : fromText.company_name;

  const total_factura = entities.total_factura ?? fromText.total_factura;
  const consumption_kwh = entities.consumption_kwh ?? fromText.consumption_kwh;

  return {
    company_name,
    consumption_kwh,
    total_factura,
    period_start: fromText.period_start,
    period_end: fromText.period_end,
    period_months: fromText.period_months,
    confidence: result.confidence,
    raw_text: fromText.raw_text,
  };
}
