/**
 * POST /api/simulate-invoice
 * Recibe una factura (PDF/imagen) via multipart/form-data, la procesa con GPT-4o
 * y devuelve la extracción completa. No escribe en base de datos.
 * Uso exclusivo del backoffice admin.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { extractInvoiceFromBufferDetailed } from '../server-lib/invoice/pipeline.js';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const config = {
  api: { bodyParser: false },
};

function parseMultipart(
  req: VercelRequest
): Promise<{ buffer: Buffer; mimeType: string; filename: string; pdfText: string | null }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      reject(new Error('Content-Type debe ser multipart/form-data'));
      return;
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 8, fieldSize: 512 * 1024 },
    });
    const chunks: Buffer[] = [];
    let mimeType = '';
    let filename = '';
    let pdfText: string | null = null;
    let fileLimitReached = false;

    busboy.on('file', (_fieldname, stream, info) => {
      mimeType = info.mimeType;
      filename = info.filename;

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        fileLimitReached = true;
      });
    });

    busboy.on('field', (fieldname, value) => {
      if (fieldname === 'pdfText') {
        pdfText = value.trim() || null;
      }
    });

    busboy.on('finish', () => {
      if (fileLimitReached) {
        reject(new Error(`El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB`));
        return;
      }
      if (chunks.length === 0) {
        reject(new Error('No se recibió ningún archivo'));
        return;
      }
      resolve({ buffer: Buffer.concat(chunks), mimeType, filename, pdfText });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const t0 = Date.now();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const tMultipart = Date.now();
    const { buffer, mimeType, filename, pdfText } = await parseMultipart(req);
    console.log(`[simulate-invoice] multipart parsed in ${Date.now() - tMultipart}ms (${filename}, ${mimeType}, ${buffer.length} bytes)`);

    if (!ALLOWED_MIMES.has(mimeType)) {
      res.status(400).json({
        error: `Tipo de archivo no soportado: ${mimeType}. Usa PDF, JPG, PNG o WebP.`,
        code: 'INVALID_MIME',
      });
      return;
    }

    const tExtract = Date.now();
    const { extraction, debug } = await extractInvoiceFromBufferDetailed(buffer, mimeType, { pdfText });
    console.log(`[simulate-invoice] extraction done in ${Date.now() - tExtract}ms`);
    res.setHeader('x-extraction-path', debug.path);
    res.setHeader('x-extraction-cache-hit', String(debug.cacheHit));
    res.setHeader('x-extraction-provided-pdf-text', String(debug.providedPdfText));
    res.setHeader('x-extraction-used-pdf-parse', String(debug.usedPdfParse));
    res.setHeader('x-extraction-used-llm', String(debug.usedLLM));
    res.setHeader('x-extraction-used-retry', String(debug.usedRetry));
    res.setHeader('x-extraction-20td-parser-accepted', String(debug.parser20td?.accepted ?? false));
    if (debug.parser20td?.score != null) {
      res.setHeader('x-extraction-20td-parser-score', String(debug.parser20td.score));
    }
    res.setHeader('Server-Timing', [
      `total;dur=${debug.timings.totalMs}`,
      debug.timings.pdfParseMs != null ? `pdfparse;dur=${debug.timings.pdfParseMs}` : null,
    ].filter(Boolean).join(', '));

    res.status(200).json({
      success: true,
      extraction,
      debug,
      file: { filename, mimeType, sizeBytes: buffer.length },
    });
    console.log(`[simulate-invoice] total ${Date.now() - t0}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error procesando factura';
    console.error('[simulate-invoice]', message);
    res.status(500).json({ success: false, error: message, code: 'PROCESSING_ERROR' });
  }
}
