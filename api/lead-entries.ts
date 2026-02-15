/**
 * POST /api/lead-entries - Crear entrada de lead y conversación inicial
 * No modifica /api/leads. Se llama tras crear/actualizar lead desde landing o integraciones.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SOURCES = new Set(['web_form', 'meta_lead_ads', 'meta_ads_web', 'csv_import', 'manual']);
function normalizeSource(source: string | undefined | null): string {
  if (!source || typeof source !== 'string') return 'manual';
  const lower = source.trim().toLowerCase();
  if (SOURCES.has(lower)) return lower;
  return 'manual';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = () => res.setHeader('Access-Control-Allow-Origin', '*');

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
    res.status(500).json({ success: false, error: 'Configuración de Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let body: Record<string, unknown>;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
    } catch {
      cors();
      res.status(400).json({ success: false, error: 'JSON inválido', code: 'INVALID_JSON' });
      return;
    }

    const lead_id = body.lead_id as string | undefined;
    if (!lead_id || typeof lead_id !== 'string') {
      cors();
      res.status(400).json({ success: false, error: 'lead_id es requerido', code: 'VALIDATION_ERROR' });
      return;
    }

    const source = normalizeSource((body.source as string) ?? 'manual');
    const campaign = (body.campaign as string) ?? null;
    const adset = (body.adset as string) ?? null;
    const ad = (body.ad as string) ?? null;
    const custom_fields =
      body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
        ? (body.custom_fields as Record<string, unknown>)
        : {};

    const { data: entry, error: entryError } = await supabase
      .from('lead_entries')
      .insert({
        lead_id,
        source,
        campaign: campaign || null,
        adset: adset || null,
        ad: ad || null,
        custom_fields,
      })
      .select()
      .single();

    if (entryError) {
      cors();
      res.status(400).json({ success: false, error: entryError.message, code: 'INSERT_ENTRY_ERROR' });
      return;
    }

    const { data: conversation, error: convError } = await supabase
      .from('lead_conversations')
      .insert({
        lead_id,
        channel: 'whatsapp',
        status: 'open',
      })
      .select()
      .single();

    if (convError) {
      cors();
      res.status(400).json({ success: false, error: convError.message, code: 'INSERT_CONVERSATION_ERROR' });
      return;
    }

    cors();
    res.status(200).json({
      success: true,
      entry,
      conversation,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/lead-entries]', err.message, err.stack);
    cors();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}
