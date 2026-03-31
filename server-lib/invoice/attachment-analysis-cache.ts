/**
 * Caché de análisis por ruta en bucket lead-attachments (sin lead_id).
 * Usada por preview-invoice y process-invoice para evitar trabajo duplicado.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const ATTACHMENT_CACHE_TTL_MS = 45 * 60 * 1000;

/** Campos de energy_comparisons (sin lead_id) que guardamos en payload. */
export type AttachmentAnalysisCachePayload = {
  raw_text: string | null;
  current_company: string | null;
  current_monthly_cost: number | null;
  best_offer_company: string | null;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  status: 'completed' | 'failed';
  ocr_confidence: number | null;
  invoice_period_months: number | null;
  prudent_mode: boolean;
  raw_extraction: Record<string, unknown> | null;
  error_message: string | null;
};

export function rowToCachePayload(row: {
  raw_text: string | null;
  current_company: string | null;
  current_monthly_cost: number | null;
  best_offer_company: string | null;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  status: string;
  ocr_confidence: number | null;
  invoice_period_months: number | null;
  prudent_mode: boolean | null;
  raw_extraction: unknown;
  error_message: string | null;
}): AttachmentAnalysisCachePayload {
  return {
    raw_text: row.raw_text,
    current_company: row.current_company,
    current_monthly_cost: row.current_monthly_cost,
    best_offer_company: row.best_offer_company,
    estimated_savings_amount: row.estimated_savings_amount,
    estimated_savings_percentage: row.estimated_savings_percentage,
    status: row.status === 'completed' ? 'completed' : 'failed',
    ocr_confidence: row.ocr_confidence,
    invoice_period_months: row.invoice_period_months,
    prudent_mode: row.prudent_mode ?? false,
    raw_extraction:
      row.raw_extraction != null && typeof row.raw_extraction === 'object'
        ? (row.raw_extraction as Record<string, unknown>)
        : null,
    error_message: row.error_message,
  };
}

export async function getAttachmentAnalysisCache(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<AttachmentAnalysisCachePayload | null> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('attachment_invoice_analysis_cache')
    .select('payload')
    .eq('storage_path', storagePath)
    .gt('expires_at', now)
    .maybeSingle();

  if (error || !data?.payload) return null;
  const p = data.payload as unknown;
  if (!p || typeof p !== 'object') return null;
  return p as AttachmentAnalysisCachePayload;
}

export async function upsertAttachmentAnalysisCache(
  supabase: SupabaseClient,
  storagePath: string,
  payload: AttachmentAnalysisCachePayload,
): Promise<void> {
  const expiresAt = new Date(Date.now() + ATTACHMENT_CACHE_TTL_MS).toISOString();
  await supabase.from('attachment_invoice_analysis_cache').upsert(
    {
      storage_path: storagePath,
      payload: payload as unknown as Record<string, unknown>,
      expires_at: expiresAt,
    },
    { onConflict: 'storage_path' },
  );
}

export async function pruneExpiredAttachmentCache(supabase: SupabaseClient): Promise<void> {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase.from('attachment_invoice_analysis_cache').delete().lt('expires_at', cutoff);
}
