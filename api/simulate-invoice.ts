/**
 * POST /api/simulate-invoice
 * Recibe una factura (PDF/imagen) via multipart/form-data, la procesa con GPT-4o
 * y devuelve la extracción completa. No escribe en base de datos.
 * Uso exclusivo del backoffice admin.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';
import { extractInvoiceFromBuffer } from '../server-lib/invoice/pipeline.js';

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
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      reject(new Error('Content-Type debe ser multipart/form-data'));
      return;
    }

    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    const chunks: Buffer[] = [];
    let mimeType = '';
    let filename = '';
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

    busboy.on('finish', () => {
      if (fileLimitReached) {
        reject(new Error(`El archivo excede el límite de ${MAX_FILE_SIZE / 1024 / 1024} MB`));
        return;
      }
      if (chunks.length === 0) {
        reject(new Error('No se recibió ningún archivo'));
        return;
      }
      resolve({ buffer: Buffer.concat(chunks), mimeType, filename });
    });

    busboy.on('error', reject);
    req.pipe(busboy);
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
    const { buffer, mimeType, filename } = await parseMultipart(req);

    if (!ALLOWED_MIMES.has(mimeType)) {
      res.status(400).json({
        error: `Tipo de archivo no soportado: ${mimeType}. Usa PDF, JPG, PNG o WebP.`,
        code: 'INVALID_MIME',
      });
      return;
    }

    const extraction = await extractInvoiceFromBuffer(buffer, mimeType);

    res.status(200).json({
      success: true,
      extraction,
      file: { filename, mimeType, sizeBytes: buffer.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error procesando factura';
    console.error('[simulate-invoice]', message);
    res.status(500).json({ success: false, error: message, code: 'PROCESSING_ERROR' });
  }
}
