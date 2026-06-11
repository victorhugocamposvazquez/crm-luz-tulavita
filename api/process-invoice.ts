/**
 * POST /api/process-invoice
 * Procesa factura (PDF/imagen), extrae datos, calcula ahorro y guarda en energy_comparisons.
 * Body: { lead_id, attachment_path } — path en bucket lead-attachments.
 * Alternativa (plan B): { lead_id, manual_extraction: { consumption_kwh, total_factura, period_months?, company_name? } }
 *   para cuando la extracción automática falla; no se usa el archivo, solo se ejecuta la comparación con esos datos.
 * Mejoras: validación de path, rate limit por lead_id y por IP.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractInvoiceFromBuffer } from '../server-lib/invoice/pipeline.js';
import { getActiveOffers, runComparison, getComparisonFailureReason } from '../server-lib/energy/calculation.js';
import { fetchInvoiceEstimateTaxConfig } from '../server-lib/energy/invoice-estimate-taxes.js';
import { validateAttachmentPath } from '../server-lib/invoice/validate-path.js';
import { emptyExtraction } from '../server-lib/invoice/types.js';
import { applySameOriginCors, createServiceClient, getClientIp } from '../server-lib/http.js';
import {
  getAttachmentAnalysisCache,
  upsertAttachmentAnalysisCache,
  pruneExpiredAttachmentCache,
  rowToCachePayload,
} from '../server-lib/invoice/attachment-analysis-cache.js';

const BUCKET = 'lead-attachments';
const TIMEOUT_MS = 55000;
const RATE_LIMIT_WINDOW_HOURS = 1;

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Desactivar con PROCESS_INVOICE_RATE_LIMIT_ENABLED=false (p. ej. desarrollo local). */
const RATE_LIMIT_ENABLED =
  process.env.PROCESS_INVOICE_RATE_LIMIT_ENABLED !== 'false' &&
  process.env.PROCESS_INVOICE_RATE_LIMIT_ENABLED !== '0';

/** Límites por hora (ventana deslizante ~1h). Ajustables por env en Vercel. */
const RATE_LIMIT_LEAD_PER_HOUR = parseEnvInt('PROCESS_INVOICE_RATE_LIMIT_LEAD_PER_HOUR', 5);
const RATE_LIMIT_IP_PER_HOUR = parseEnvInt('PROCESS_INVOICE_RATE_LIMIT_IP_PER_HOUR', 120);

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = () => applySameOriginCors(req, res);

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

  const supabase = createServiceClient();
  if (!supabase) {
    cors();
    res.status(500).json({ error: 'Configuración Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

  type ManualExtraction = {
    consumption_kwh?: number;
    total_factura?: number;
    period_months?: number;
    company_name?: string | null;
  };
  let body: { lead_id?: string; attachment_path?: string; manual_extraction?: ManualExtraction; force?: boolean };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    cors();
    res.status(400).json({ error: 'JSON inválido', code: 'INVALID_JSON' });
    return;
  }

  const lead_id = body.lead_id;
  const attachment_path = body.attachment_path;
  const manual_extraction = body.manual_extraction;
  /** force=true (reanálisis admin): ignora la caché de análisis del adjunto. */
  const forceReanalysis = body.force === true;
  const useManual = manual_extraction != null &&
    typeof manual_extraction.consumption_kwh === 'number' &&
    manual_extraction.consumption_kwh > 0 &&
    typeof manual_extraction.total_factura === 'number' &&
    manual_extraction.total_factura > 0;

  if (!lead_id || typeof lead_id !== 'string') {
    cors();
    res.status(400).json({ error: 'lead_id es obligatorio', code: 'VALIDATION_ERROR' });
    return;
  }
  if (!useManual && (!attachment_path || typeof attachment_path !== 'string')) {
    cors();
    res.status(400).json({ error: 'attachment_path es obligatorio si no envías manual_extraction', code: 'VALIDATION_ERROR' });
    return;
  }
  if (!useManual) {
    const pathValidation = validateAttachmentPath(attachment_path!);
    if (!pathValidation.valid) {
      cors();
      res.status(400).json({ error: pathValidation.error || 'Ruta no válida', code: 'INVALID_PATH' });
      return;
    }
  }
  const period_months = useManual
    ? Math.min(12, Math.max(1, Math.floor(Number(manual_extraction!.period_months)) || 1))
    : undefined;

  // El lead debe existir y, si registró un adjunto al crearse, el path debe coincidir
  // (evita procesar archivos ajenos contra un lead_id filtrado).
  {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, custom_fields')
      .eq('id', lead_id)
      .maybeSingle();
    if (leadError || !lead) {
      cors();
      res.status(404).json({ error: 'Lead no encontrado', code: 'LEAD_NOT_FOUND' });
      return;
    }
    if (!useManual) {
      const cf = lead.custom_fields as Record<string, unknown> | null;
      const adj = cf?.adjuntar_factura as { path?: unknown } | undefined;
      const recordedPath = typeof adj?.path === 'string' ? adj.path : null;
      if (recordedPath && recordedPath !== attachment_path) {
        cors();
        res.status(403).json({ error: 'El archivo no pertenece a este lead', code: 'ATTACHMENT_MISMATCH' });
        return;
      }
    }
  }

  if (RATE_LIMIT_ENABLED) {
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
  }

  /** Plan B: comparación solo con datos manuales (sin procesar archivo). */
  if (useManual) {
    try {
      const [offers, taxConfig] = await Promise.all([
        getActiveOffers(supabase),
        fetchInvoiceEstimateTaxConfig(supabase),
      ]);
      const extraction = {
        ...emptyExtraction(),
        company_name: manual_extraction!.company_name ?? null,
        consumption_kwh: manual_extraction!.consumption_kwh!,
        total_factura: manual_extraction!.total_factura!,
        period_months: period_months ?? 1,
        confidence: 0.9,
      };
      const result = runComparison(extraction, offers, taxConfig);
      const row = {
        lead_id,
        current_company: result?.current_company ?? extraction.company_name,
        current_monthly_cost: result?.current_monthly_cost ?? null,
        best_offer_company: result?.best_offer_company ?? null,
        estimated_savings_amount: result?.estimated_savings_amount ?? null,
        estimated_savings_percentage: result?.estimated_savings_percentage ?? null,
        status: result ? 'completed' : 'failed',
        ocr_confidence: 0.9,
        invoice_period_months: period_months,
        prudent_mode: result?.prudent_mode ?? false,
        raw_extraction: {
          company_name: extraction.company_name,
          consumption_kwh: extraction.consumption_kwh,
          total_factura: extraction.total_factura,
          period_months: extraction.period_months,
        },
        error_message: result ? null : getComparisonFailureReason(extraction, offers),
      };
      const { data: inserted, error: insertError } = await supabase
        .from('energy_comparisons')
        .insert(row)
        .select('id, lead_id, current_company, current_monthly_cost, best_offer_company, estimated_savings_amount, estimated_savings_percentage, status, ocr_confidence, prudent_mode, error_message, created_at')
        .single();
      if (insertError) throw insertError;
      cors();
      res.status(200).json({ success: true, comparison: inserted });
      return;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error calculando ahorro con los datos introducidos';
      console.error('[process-invoice] manual', message);
      cors();
      res.status(500).json({ success: false, error: message, code: 'MANUAL_COMPARISON_ERROR' });
      return;
    }
  }

  // Estado compartido para que solo se escriba UNA fila terminal en energy_comparisons
  // aunque el trabajo siga ejecutándose tras un timeout (Promise.race no cancela).
  const state = { timedOut: false, inserted: false };

  const runWithTimeout = async () => {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        state.timedOut = true;
        reject(new Error('Timeout procesando factura'));
      }, TIMEOUT_MS)
    );
    const work = (async () => {
      const cached = forceReanalysis ? null : await getAttachmentAnalysisCache(supabase, attachment_path!);
      if (cached) {
        const rowFromCache = {
          lead_id,
          attachment_path,
          raw_text: cached.raw_text,
          current_company: cached.current_company,
          current_monthly_cost: cached.current_monthly_cost,
          best_offer_company: cached.best_offer_company,
          estimated_savings_amount: cached.estimated_savings_amount,
          estimated_savings_percentage: cached.estimated_savings_percentage,
          status: cached.status,
          ocr_confidence: cached.ocr_confidence,
          invoice_period_months: cached.invoice_period_months ?? 1,
          prudent_mode: cached.prudent_mode,
          raw_extraction: cached.raw_extraction,
          error_message: cached.error_message,
        };
        if (state.timedOut) return null;
        const { data: inserted, error: insertError } = await supabase
          .from('energy_comparisons')
          .insert(rowFromCache)
          .select('id, lead_id, current_company, current_monthly_cost, best_offer_company, estimated_savings_amount, estimated_savings_percentage, status, ocr_confidence, prudent_mode, error_message, created_at')
          .single();
        if (insertError) throw insertError;
        state.inserted = true;
        await pruneExpiredAttachmentCache(supabase);
        return inserted;
      }

      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(attachment_path);
      if (downloadError || !fileData) {
        throw new Error(downloadError?.message || 'No se pudo descargar el archivo');
      }
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const mimeType = fileData.type || (attachment_path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      // El texto del PDF se extrae siempre en servidor: no se acepta pdf_text del
      // cliente, que permitiría inflar consumos/importes manipulando el texto.
      const [extraction, offers, taxConfig] = await Promise.all([
        extractInvoiceFromBuffer(buffer, mimeType, forceReanalysis ? { skipCache: true } : undefined),
        getActiveOffers(supabase),
        fetchInvoiceEstimateTaxConfig(supabase),
      ]);
      const result = runComparison(extraction, offers, taxConfig);

      const row = {
        lead_id,
        attachment_path,
        raw_text: extraction.raw_text != null ? extraction.raw_text.slice(0, 10000) : null,
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
          importe_energia_activa: extraction.importe_energia_activa,
          importe_potencia: extraction.importe_potencia,
          period_months: extraction.period_months,
          potencia_contratada_kw: extraction.potencia_contratada_kw,
          potencia_p1_kw: extraction.potencia_p1_kw,
          potencia_p2_kw: extraction.potencia_p2_kw,
          potencia_p3_kw: extraction.potencia_p3_kw,
          potencia_p4_kw: extraction.potencia_p4_kw,
          potencia_p5_kw: extraction.potencia_p5_kw,
          potencia_p6_kw: extraction.potencia_p6_kw,
          precio_energia_kwh: extraction.precio_energia_kwh,
          precio_p1_kwh: extraction.precio_p1_kwh,
          precio_p2_kwh: extraction.precio_p2_kwh,
          precio_p3_kwh: extraction.precio_p3_kwh,
          precio_p4_kwh: extraction.precio_p4_kwh,
          precio_p5_kwh: extraction.precio_p5_kwh,
          precio_p6_kwh: extraction.precio_p6_kwh,
          consumo_p1_kwh: extraction.consumo_p1_kwh,
          consumo_p2_kwh: extraction.consumo_p2_kwh,
          consumo_p3_kwh: extraction.consumo_p3_kwh,
          consumo_p4_kwh: extraction.consumo_p4_kwh,
          consumo_p5_kwh: extraction.consumo_p5_kwh,
          consumo_p6_kwh: extraction.consumo_p6_kwh,
          tipo_tarifa: extraction.tipo_tarifa,
          cups: extraction.cups,
          titular: extraction.titular,
        },
        error_message: result ? null : getComparisonFailureReason(extraction, offers),
      };

      if (state.timedOut) {
        // La respuesta HTTP ya se cerró con timeout: no insertamos otra fila terminal,
        // pero sí cacheamos el análisis para que el reintento sea inmediato.
        await upsertAttachmentAnalysisCache(
          supabase,
          attachment_path!,
          rowToCachePayload({
            raw_text: row.raw_text,
            current_company: row.current_company,
            current_monthly_cost: row.current_monthly_cost,
            best_offer_company: row.best_offer_company,
            estimated_savings_amount: row.estimated_savings_amount,
            estimated_savings_percentage: row.estimated_savings_percentage,
            status: row.status,
            ocr_confidence: row.ocr_confidence,
            invoice_period_months: row.invoice_period_months,
            prudent_mode: row.prudent_mode,
            raw_extraction: row.raw_extraction,
            error_message: row.error_message,
          }),
        );
        return null;
      }

      const { data: inserted, error: insertError } = await supabase
        .from('energy_comparisons')
        .insert(row)
        .select('id, lead_id, current_company, current_monthly_cost, best_offer_company, estimated_savings_amount, estimated_savings_percentage, status, ocr_confidence, prudent_mode, error_message, created_at')
        .single();

      if (insertError) throw insertError;
      state.inserted = true;

      await upsertAttachmentAnalysisCache(
        supabase,
        attachment_path!,
        rowToCachePayload({
          raw_text: row.raw_text,
          current_company: row.current_company,
          current_monthly_cost: row.current_monthly_cost,
          best_offer_company: row.best_offer_company,
          estimated_savings_amount: row.estimated_savings_amount,
          estimated_savings_percentage: row.estimated_savings_percentage,
          status: row.status,
          ocr_confidence: row.ocr_confidence,
          invoice_period_months: row.invoice_period_months,
          prudent_mode: row.prudent_mode,
          raw_extraction: row.raw_extraction,
          error_message: row.error_message,
        }),
      );
      await pruneExpiredAttachmentCache(supabase);

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
    if (!state.inserted) {
      try {
        await supabase.from('energy_comparisons').insert({
          lead_id,
          attachment_path: attachment_path ?? null,
          status: 'failed',
          error_message: message,
        });
      } catch {
        /* ignore */
      }
    }
    cors();
    res.status(500).json({
      success: false,
      error: message,
      code: 'PROCESSING_ERROR',
    });
  }
}
