/**
 * POST /api/process-invoice
 * Procesa factura (PDF/imagen), extrae datos, calcula ahorro y guarda en energy_comparisons.
 * Body: { lead_id, attachment_path } — path en bucket lead-attachments.
 * Mejoras: validación de path, rate limit por lead_id y por IP.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { extractInvoiceFromBuffer } from '../server-lib/invoice/pipeline.js';
import { getActiveOffers, runComparison } from '../server-lib/energy/calculation.js';
import { validateAttachmentPath } from '../server-lib/invoice/validate-path.js';

const BUCKET = 'lead-attachments';
/** Document AI puede tardar 15-30s en PDFs/imágenes. En Vercel Hobby el límite es 10s; en Pro, 60s. */
const TIMEOUT_MS = 30000;
const RATE_LIMIT_LEAD_PER_HOUR = 3;
const RATE_LIMIT_IP_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_HOURS = 1;

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real.trim();
  return 'unknown';
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

  let body: { lead_id?: string; attachment_path?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    cors();
    res.status(400).json({ error: 'JSON inválido', code: 'INVALID_JSON' });
    return;
  }

  const lead_id = body.lead_id;
  const attachment_path = body.attachment_path;
  if (!lead_id || typeof lead_id !== 'string' || !attachment_path || typeof attachment_path !== 'string') {
    cors();
    res.status(400).json({ error: 'lead_id y attachment_path son obligatorios', code: 'VALIDATION_ERROR' });
    return;
  }

  const pathValidation = validateAttachmentPath(attachment_path);
  if (!pathValidation.valid) {
    cors();
    res.status(400).json({ error: pathValidation.error || 'Ruta no válida', code: 'INVALID_PATH' });
    return;
  }

  const clientIp = getClientIp(req);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { count: leadCount } = await supabase
    .from('energy_comparisons')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', lead_id)
    .gte('created_at', windowStart);

  if ((leadCount ?? 0) >= RATE_LIMIT_LEAD_PER_HOUR) {
    cors();
    res.status(429).json({
      error: 'Demasiadas solicitudes para este lead. Intenta de nuevo más tarde.',
      code: 'RATE_LIMIT_LEAD',
    });
    return;
  }

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

  const runWithTimeout = async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout procesando factura')), TIMEOUT_MS)
    );
    const work = (async () => {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(attachment_path);
      if (downloadError || !fileData) {
        throw new Error(downloadError?.message || 'No se pudo descargar el archivo');
      }
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mimeType = fileData.type || (attachment_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const extraction = await extractInvoiceFromBuffer(buffer, mimeType);
      const offers = await getActiveOffers(supabase);
      const result = runComparison(extraction, offers);

      const row = {
        lead_id,
        current_company: result?.current_company ?? extraction.company_name,
        current_monthly_cost: result?.current_monthly_cost ?? null,
        best_offer_company: result?.best_offer_company ?? null,
        estimated_savings_amount: result?.estimated_savings_amount ?? null,
        estimated_savings_percentage: result?.estimated_savings_percentage ?? null,
        status: result ? 'completed' : 'failed',
        ocr_confidence: extraction.confidence,
        invoice_period_months: extraction.period_months,
        prudent_mode: result?.prudent_mode ?? false,
        raw_extraction: {
          company_name: extraction.company_name,
          consumption_kwh: extraction.consumption_kwh,
          total_factura: extraction.total_factura,
          period_months: extraction.period_months,
        },
        error_message: result ? null : 'No se pudo extraer consumo/total o no hay ofertas comparables',
      };

      const { data: inserted, error: insertError } = await supabase
        .from('energy_comparisons')
        .insert(row)
        .select('id, status, estimated_savings_amount, estimated_savings_percentage, best_offer_company')
        .single();

      if (insertError) throw insertError;
      return inserted;
    })();
    return Promise.race([work, timeoutPromise]);
  };

  try {
    const inserted = await runWithTimeout();
    cors();
    res.status(200).json({
      success: true,
      comparison: inserted,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error procesando factura';
    console.error('[process-invoice]', message);
    try {
      await supabase.from('energy_comparisons').insert({
        lead_id,
        status: 'failed',
        error_message: message,
      });
    } catch {
      /* ignore */
    }
    cors();
    res.status(500).json({
      success: false,
      error: message,
      code: 'PROCESSING_ERROR',
    });
  }
}
