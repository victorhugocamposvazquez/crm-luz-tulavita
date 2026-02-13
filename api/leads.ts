/**
 * POST /api/leads - Endpoint único para creación de leads
 * Lógica inline para evitar ERR_MODULE_NOT_FOUND en Vercel
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Normalizer (inline) ---
function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
  if (/^[679]\d{8}$/.test(cleaned)) return `+34${cleaned}`;
  if (/^34[679]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+34[679]\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) {
    return digits.startsWith('34') ? `+${digits}` : `+34${digits}`;
  }
  return null;
}

function normalizeEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}

function normalizeName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const SOURCES = new Set(['web_form', 'meta_lead_ads', 'meta_ads_web', 'csv_import', 'manual']);
function normalizeSource(source: string | undefined | null): string {
  if (!source || typeof source !== 'string') return 'manual';
  const lower = source.trim().toLowerCase();
  if (SOURCES.has(lower)) return lower;
  if (['meta', 'facebook', 'instagram', 'lead ads'].some((s) => lower.includes(s))) return 'meta_lead_ads';
  if (['form', 'formulario', 'landing', 'web'].some((s) => lower.includes(s))) return 'web_form';
  if (['csv', 'excel', 'import'].some((s) => lower.includes(s))) return 'csv_import';
  return 'manual';
}

// --- Deduplicator (inline) ---
async function findExistingLead(
  supabase: SupabaseClient,
  phone: string | null,
  email: string | null
): Promise<{ existingId: string | null; matchBy: 'phone' | 'email' | null }> {
  if (phone) {
    const { data } = await supabase.from('leads').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return { existingId: data.id, matchBy: 'phone' };
  }
  if (email) {
    const { data } = await supabase.from('leads').select('id').eq('email', email).limit(1).maybeSingle();
    if (data?.id) return { existingId: data.id, matchBy: 'email' };
  }
  return { existingId: null, matchBy: null };
}

// --- createLead (inline) ---
async function createLead(
  supabase: SupabaseClient,
  input: {
    name?: string;
    phone?: string;
    email?: string;
    source?: string;
    campaign?: string;
    adset?: string;
    ad?: string;
    status?: string;
    owner_id?: string;
    tags?: string[];
    custom_fields?: Record<string, unknown>;
  },
  options?: { defaultOwnerId?: string; createInitialTask?: boolean }
) {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  if (!phone && !email) {
    return { success: false, error: 'Se requiere al menos teléfono o email', code: 'VALIDATION_ERROR' };
  }

  const name = normalizeName(input.name);
  const source = normalizeSource(input.source);
  const { existingId, matchBy } = await findExistingLead(supabase, phone, email);

  if (existingId) {
    const { data: updated, error } = await supabase
      .from('leads')
      .update({
        name: name ?? undefined,
        phone: phone ?? undefined,
        email: email ?? undefined,
        source,
        campaign: input.campaign ?? undefined,
        adset: input.adset ?? undefined,
        ad: input.ad ?? undefined,
        tags: input.tags ?? undefined,
        custom_fields: input.custom_fields ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
      .select()
      .single();

    if (error) return { success: false, error: error.message, code: 'UPDATE_ERROR' };

    await supabase.from('lead_events').insert({
      lead_id: existingId,
      type: 'lead_updated',
      content: { matchBy, updatedFields: input, source },
    });

    if (options?.createInitialTask && (updated as { owner_id?: string }).owner_id) {
      try {
        await supabase.from('admin_tasks').insert({
          type: 'lead_contact',
          title: `Contactar lead: ${name ?? email ?? phone ?? 'Sin nombre'}`,
          description: `Lead nuevo desde ${source}`,
          status: 'pending',
          commercial_id: (updated as { owner_id: string }).owner_id,
          client_id: null,
        });
      } catch {
        /* ignore */
      }
    }

    return { success: true, lead: updated, isNew: false, eventType: 'lead_updated' };
  }

  const ownerId = input.owner_id ?? options?.defaultOwnerId ?? null;
  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      name,
      phone,
      email,
      source,
      campaign: input.campaign ?? null,
      adset: input.adset ?? null,
      ad: input.ad ?? null,
      status: input.status ?? 'new',
      owner_id: ownerId,
      tags: input.tags ?? [],
      custom_fields: input.custom_fields ?? {},
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message, code: 'INSERT_ERROR' };

  await supabase.from('lead_events').insert({
    lead_id: (inserted as { id: string }).id,
    type: 'lead_created',
    content: { source, campaign: input.campaign, adset: input.adset, ad: input.ad },
  });

  if (options?.createInitialTask && ownerId) {
    try {
      await supabase.from('admin_tasks').insert({
        type: 'lead_contact',
        title: `Contactar lead: ${name ?? email ?? phone ?? 'Sin nombre'}`,
        description: `Lead nuevo desde ${source}`,
        status: 'pending',
        commercial_id: ownerId,
        client_id: null,
      });
    } catch {
      /* ignore */
    }
  }

  return { success: true, lead: inserted, isNew: true, eventType: 'lead_created' };
}

// --- Handler ---
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
    res.status(500).json({ error: 'Configuración de Supabase incompleta' });
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

    const input = {
      name: body.name,
      phone: body.phone,
      email: body.email,
      source: body.source ?? 'web_form',
      campaign: body.campaign,
      adset: body.adset,
      ad: body.ad,
      status: body.status,
      owner_id: body.owner_id,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
      custom_fields:
        body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
          ? body.custom_fields
          : undefined,
    };

    const result = await createLead(supabase, input, {
      defaultOwnerId: body.default_owner_id as string | undefined,
      createInitialTask: body.create_initial_task as boolean | undefined,
    });

    if (!result.success) {
      cors();
      res.status(400).json(result);
      return;
    }

    cors();
    res.status(200).json(result);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/leads]', err.message, err.stack);
    cors();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}
