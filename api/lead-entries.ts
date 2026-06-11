/**
 * POST /api/lead-entries - Crear entrada de lead y conversación inicial
 * No modifica /api/leads. Se llama tras crear/actualizar lead desde landing o integraciones.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySameOriginCors, createServiceClient } from '../server-lib/http.js';

/** Ventana de deduplicación: reenvíos/reintentos del mismo lead no duplican entrada ni conversación. */
const DEDUP_WINDOW_MINUTES = 10;

const SOURCES = new Set(['web_form', 'meta_lead_ads', 'meta_ads_web', 'csv_import', 'manual', 'collaborator_referral']);
function normalizeSource(source: string | undefined | null): string {
  if (!source || typeof source !== 'string') return 'manual';
  const lower = source.trim().toLowerCase();
  if (SOURCES.has(lower)) return lower;
  return 'manual';
}

function isUuid(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

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
    res.status(500).json({ success: false, error: 'Configuración de Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

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

    const collaborator_id = typeof body.collaborator_id === 'string' ? body.collaborator_id : undefined;
    if (typeof body.collaborator_id === 'string' && !isUuid(collaborator_id)) {
      cors();
      res.status(400).json({ success: false, error: 'collaborator_id inválido', code: 'VALIDATION_ERROR' });
      return;
    }

    const source = collaborator_id ? 'collaborator_referral' : normalizeSource((body.source as string) ?? 'manual');
    const campaign = (body.campaign as string) ?? null;
    const adset = (body.adset as string) ?? null;
    const ad = (body.ad as string) ?? null;
    const custom_fields =
      body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
        ? (body.custom_fields as Record<string, unknown>)
        : {};

    // Dedup: si hay una entrada reciente del mismo lead con la misma fuente/campaña
    // (reintento del cliente o doble submit), se reutiliza en lugar de duplicar.
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MINUTES * 60 * 1000).toISOString();
    const { data: recentEntry } = await supabase
      .from('lead_entries')
      .select('*')
      .eq('lead_id', lead_id)
      .eq('source', source)
      .gte('created_at', dedupSince)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let entry = recentEntry ?? null;
    if (!entry) {
      const { data: insertedEntry, error: entryError } = await supabase
        .from('lead_entries')
        .insert({
          lead_id,
          source,
          collaborator_id: collaborator_id ?? null,
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
      entry = insertedEntry;
    }

    // Conversación: reutilizar la abierta de WhatsApp si existe (evita abrir varias
    // conversaciones para el mismo lead en reenvíos).
    const { data: openConversation } = await supabase
      .from('lead_conversations')
      .select('*')
      .eq('lead_id', lead_id)
      .eq('channel', 'whatsapp')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversation = openConversation ?? null;
    if (!conversation) {
      const { data: insertedConv, error: convError } = await supabase
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
      conversation = insertedConv;
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
