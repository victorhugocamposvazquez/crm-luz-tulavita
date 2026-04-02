/**
 * POST /api/preview-invoice
 * Analiza factura en storage sin lead_id (prefetch mientras el usuario rellena el formulario).
 * Body: { attachment_path } — misma validación que process-invoice.
 * Respuesta: { success, comparison } con forma similar a process-invoice (ids placeholder).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceFromBuffer } from '../server-lib/invoice/pipeline.js';
import { getActiveOffers, runComparison, getComparisonFailureReason } from '../server-lib/energy/calculation.js';
import { fetchInvoiceEstimateTaxConfig } from '../server-lib/energy/invoice-estimate-taxes.js';
import { validateAttachmentPath } from '../server-lib/invoice/validate-path.js';
import {
  getAttachmentAnalysisCache,
  upsertAttachmentAnalysisCache,
  pruneExpiredAttachmentCache,
  rowToCachePayload,
} from '../server-lib/invoice/attachment-analysis-cache.js';

const BUCKET = 'lead-attachments';
const TIMEOUT_MS = 55000;
const RATE_LIMIT_WINDOW_HOURS = 1;
const MAX_PDF_TEXT_BODY_CHARS = 400_000;

function normalizeClientPdfText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length > MAX_PDF_TEXT_BODY_CHARS ? t.slice(0, MAX_PDF_TEXT_BODY_CHARS) : t;
}

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000001';
const PLACEHOLDER_LEAD_ID = '00000000-0000-4000-8000-000000000002';

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const RATE_LIMIT_ENABLED =
  process.env.PROCESS_INVOICE_RATE_LIMIT_ENABLED !== 'false' &&
  process.env.PROCESS_INVOICE_RATE_LIMIT_ENABLED !== '0';

const RATE_LIMIT_IP_PER_HOUR = parseEnvInt('PROCESS_INVOICE_RATE_LIMIT_IP_PER_HOUR', 120);

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real.trim();
  return 'unknown';
}

function comparisonFromPayload(
  path: string,
  p: AttachmentAnalysisCachePayload,
): Record<string, unknown> {
  return {
    id: PLACEHOLDER_ID,
    lead_id: PLACEHOLDER_LEAD_ID,
    attachment_path: path,
    current_company: p.current_company,
    current_monthly_cost: p.current_monthly_cost,
    best_offer_company: p.best_offer_company,
    estimated_savings_amount: p.estimated_savings_amount,
    estimated_savings_percentage: p.estimated_savings_percentage,
    status: p.status,
    ocr_confidence: p.ocr_confidence,
    prudent_mode: p.prudent_mode,
    error_message: p.error_message,
    created_at: new Date().toISOString(),
  };
}

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  if (req.method === 'OPTIONS') {
    cors();
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    cors();
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    cors();
    res.status(500).json({ error: 'Configuración Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: { attachment_path?: string; pdf_text?: unknown };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    cors();
    res.status(400).json({ error: 'JSON inválido', code: 'INVALID_JSON' });
    return;
  }

  const attachment_path = body.attachment_path;
  const clientPdfText = normalizeClientPdfText(body.pdf_text);
  if (!attachment_path || typeof attachment_path !== 'string') {
    cors();
    res.status(400).json({ error: 'attachment_path es obligatorio', code: 'VALIDATION_ERROR' });
    return;
  }

  const pathValidation = validateAttachmentPath(attachment_path);
  if (!pathValidation.valid) {
    cors();
    res.status(400).json({ error: pathValidation.error || 'Ruta no válida', code: 'INVALID_PATH' });
    return;
  }

  if (RATE_LIMIT_ENABLED) {
    const clientIp = getClientIp(req);
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { count: ipCount } = await supabase
      .from('process_invoice_rate_log')
      .select('*', { count: 'exact', head: true })
      .eq('ip', clientIp)
      .gte('created_at', windowStart);

    if ((ipCount ?? 0) >= RATE_LIMIT_IP_PER_HOUR) {
      cors();
      res.status(429).json({
        error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.',
        code: 'RATE_LIMIT_IP',
      });
      return;
    }

    await supabase.from('process_invoice_rate_log').insert({ ip: clientIp });
    await supabase
      .from('process_invoice_rate_log')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
  }

  const runWithTimeout = async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout analizando factura')), TIMEOUT_MS),
    );
    const work = (async () => {
      const cached = await getAttachmentAnalysisCache(supabase, attachment_path);
      if (cached) {
        return comparisonFromPayload(attachment_path, cached);
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(attachment_path);
      if (downloadError || !fileData) {
        throw new Error(downloadError?.message || 'No se pudo descargar el archivo');
      }
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mimeType = fileData.type || (attachment_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      const extractOpts =
        mimeType === 'application/pdf' && clientPdfText ? { pdfText: clientPdfText } : undefined;

      const [extraction, offers, taxConfig] = await Promise.all([
        extractInvoiceFromBuffer(buffer, mimeType, extractOpts),
        getActiveOffers(supabase),
        fetchInvoiceEstimateTaxConfig(supabase),
      ]);
      const result = runComparison(extraction, offers, taxConfig);

      const row = {
        raw_text: extraction.raw_text != null ? extraction.raw_text.slice(0, 10000) : null,
        current_company: result?.current_company ?? extraction.company_name,
        current_monthly_cost: result?.current_monthly_cost ?? null,
        best_offer_company: result?.best_offer_company ?? null,
        estimated_savings_amount: result?.estimated_savings_amount ?? null,
        estimated_savings_percentage: result?.estimated_savings_percentage ?? null,
        status: result ? ('completed' as const) : ('failed' as const),
        ocr_confidence: extraction.confidence,
        invoice_period_months: extraction.period_months,
        prudent_mode: result?.prudent_mode ?? false,
        raw_extraction: {
          company_name: extraction.company_name,
          consumption_kwh: extraction.consumption_kwh,
          total_factura: extraction.total_factura,
          period_months: extraction.period_months,
          potencia_contratada_kw: extraction.potencia_contratada_kw,
          potencia_p1_kw: extraction.potencia_p1_kw,
          potencia_p2_kw: extraction.potencia_p2_kw,
          precio_energia_kwh: extraction.precio_energia_kwh,
          precio_p1_kwh: extraction.precio_p1_kwh,
          precio_p2_kwh: extraction.precio_p2_kwh,
          tipo_tarifa: extraction.tipo_tarifa,
          cups: extraction.cups,
          titular: extraction.titular,
        },
        error_message: result ? null : getComparisonFailureReason(extraction, offers),
      };

      const payload = rowToCachePayload({
        ...row,
        status: row.status,
      });
      await upsertAttachmentAnalysisCache(supabase, attachment_path, payload);
      await pruneExpiredAttachmentCache(supabase);

      return comparisonFromPayload(attachment_path, payload);
    })();
    return Promise.race([work, timeoutPromise]);
  };

  try {
    const comparison = await runWithTimeout();
    cors();
    res.status(200).json({ success: true, comparison });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error analizando factura';
    console.error('[preview-invoice]', message);
    cors();
    res.status(500).json({ success: false, error: message, code: 'PREVIEW_ERROR' });
  }
}
