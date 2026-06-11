/**
 * POST /api/leads - Endpoint único para creación de leads
 * Lógica inline para evitar ERR_MODULE_NOT_FOUND en Vercel
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { applySameOriginCors, createServiceClient, getClientIp } from '../server-lib/http.js';

// --- Normalizer (inline) ---
function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
  if (/^[679]\d{8}$/.test(cleaned)) return `+34${cleaned}`;
  if (/^34[679]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+34[679]\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 15) {
    return digits.startsWith('34') ? `+${digits}` : `+34${digits}`;
  }
  if (digits.length === 9) {
    return /^[679]\d{8}$/.test(digits) ? `+34${digits}` : digits;
  }
  // No perder el dato si el usuario envía un teléfono corto (p.ej. 8 dígitos).
  if (digits.length >= 6) return digits;
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

const SOURCES = new Set(['web_form', 'meta_lead_ads', 'meta_ads_web', 'csv_import', 'manual', 'collaborator_referral']);
function normalizeSource(source: string | undefined | null): string {
  if (!source || typeof source !== 'string') return 'manual';
  const lower = source.trim().toLowerCase();
  if (SOURCES.has(lower)) return lower;
  if (['meta', 'facebook', 'instagram', 'lead ads'].some((s) => lower.includes(s))) return 'meta_lead_ads';
  if (['form', 'formulario', 'landing', 'web'].some((s) => lower.includes(s))) return 'web_form';
  if (['csv', 'excel', 'import'].some((s) => lower.includes(s))) return 'csv_import';
  return 'manual';
}

function isUuid(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// Rate limit por IP para TODOS los POST públicos (no solo los de colaborador).
const RATE_LIMIT_ENABLED =
  process.env.COLLAB_LEAD_RATE_LIMIT_ENABLED !== 'false' &&
  process.env.COLLAB_LEAD_RATE_LIMIT_ENABLED !== '0';
const RATE_LIMIT_PER_IP_PER_HOUR = parseEnvInt('COLLAB_LEAD_RATE_LIMIT_PER_IP_PER_HOUR', 30);

type ExistingLeadRow = {
  id: string;
  source: string | null;
  campaign: string | null;
  collaborator_id: string | null;
  referred_by_collaborator_id: string | null;
  custom_fields: Record<string, unknown> | null;
};

const EXISTING_LEAD_COLUMNS = 'id, source, campaign, collaborator_id, referred_by_collaborator_id, custom_fields';

// --- Deduplicator (inline) ---
async function findExistingLead(
  supabase: SupabaseClient,
  phone: string | null,
  email: string | null
): Promise<{ existing: ExistingLeadRow | null; matchBy: 'phone' | 'email' | null }> {
  if (phone) {
    const { data } = await supabase.from('leads').select(EXISTING_LEAD_COLUMNS).eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return { existing: data as ExistingLeadRow, matchBy: 'phone' };
  }
  if (email) {
    const { data } = await supabase.from('leads').select(EXISTING_LEAD_COLUMNS).eq('email', email).limit(1).maybeSingle();
    if (data?.id) return { existing: data as ExistingLeadRow, matchBy: 'email' };
  }
  return { existing: null, matchBy: null };
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
    collaborator_id?: string;
    referred_by_collaborator_id?: string;
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
  const source = input.collaborator_id ? 'collaborator_referral' : normalizeSource(input.source);
  const { existing, matchBy } = await findExistingLead(supabase, phone, email);

  if (existing) {
    const existingId = existing.id;

    // No degradar atribución en reenvíos: si el lead ya estaba atribuido a un
    // colaborador y este envío no trae colaborador, se conservan source/campaign
    // y collaborator_id originales.
    const preserveCollabAttribution = !!existing.collaborator_id && !input.collaborator_id;

    // custom_fields se fusionan (las claves nuevas ganan) en vez de pisarse:
    // un reenvío sin factura no debe borrar los datos de factura previos.
    const mergedCustomFields = input.custom_fields
      ? { ...(existing.custom_fields ?? {}), ...input.custom_fields }
      : undefined;

    const { data: updated, error } = await supabase
      .from('leads')
      .update({
        name: name ?? undefined,
        phone: phone ?? undefined,
        email: email ?? undefined,
        source: preserveCollabAttribution ? undefined : source,
        campaign: preserveCollabAttribution ? undefined : input.campaign ?? undefined,
        adset: input.adset ?? undefined,
        ad: input.ad ?? undefined,
        collaborator_id: existing.collaborator_id ?? input.collaborator_id ?? undefined,
        referred_by_collaborator_id:
          existing.referred_by_collaborator_id ?? input.referred_by_collaborator_id ?? undefined,
        tags: input.tags ?? undefined,
        custom_fields: mergedCustomFields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
      .select()
      .single();

    if (error) return { success: false, error: error.message, code: 'UPDATE_ERROR' };

    await supabase.from('lead_events').insert({
      lead_id: existingId,
      type: 'lead_updated',
      content: { matchBy, updatedFields: input, source, collaborator_id: input.collaborator_id ?? null },
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
      collaborator_id: input.collaborator_id ?? null,
      referred_by_collaborator_id: input.referred_by_collaborator_id ?? null,
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
    content: {
      source,
      campaign: input.campaign,
      adset: input.adset,
      ad: input.ad,
      collaborator_id: input.collaborator_id ?? null,
    },
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
    res.status(500).json({ error: 'Configuración de Supabase incompleta' });
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

    const input = {
      name: typeof body.name === 'string' ? body.name : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      source: typeof body.source === 'string' ? body.source : 'web_form',
      campaign: typeof body.campaign === 'string' ? body.campaign : undefined,
      adset: typeof body.adset === 'string' ? body.adset : undefined,
      ad: typeof body.ad === 'string' ? body.ad : undefined,
      collaborator_id: typeof body.collaborator_id === 'string' && isUuid(body.collaborator_id) ? body.collaborator_id : undefined,
      referred_by_collaborator_id:
        typeof body.referred_by_collaborator_id === 'string' && isUuid(body.referred_by_collaborator_id)
          ? body.referred_by_collaborator_id
          : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      owner_id: typeof body.owner_id === 'string' ? body.owner_id : undefined,
      tags: Array.isArray(body.tags)
        ? (body.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : undefined,
      custom_fields:
        body.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
          ? (body.custom_fields as Record<string, unknown>)
          : undefined,
    };

    if (typeof body.collaborator_id === 'string' && !input.collaborator_id) {
      cors();
      res.status(400).json({ success: false, error: 'collaborator_id no tiene formato UUID válido', code: 'VALIDATION_ERROR' });
      return;
    }

    if (RATE_LIMIT_ENABLED) {
      const ip = getClientIp(req);
      const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('collaborator_lead_rate_log')
        .select('*', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('created_at', windowStart);
      if ((count ?? 0) >= RATE_LIMIT_PER_IP_PER_HOUR) {
        cors();
        res.status(429).json({
          success: false,
          error: 'Demasiadas solicitudes desde esta IP. Intenta de nuevo más tarde.',
          code: 'RATE_LIMIT_IP',
        });
        return;
      }
      await supabase.from('collaborator_lead_rate_log').insert({
        ip,
        collaborator_id: input.collaborator_id ?? null,
      });
      await supabase
        .from('collaborator_lead_rate_log')
        .delete()
        .lt('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    }

    // Asignar al responsable de colaboradores los leads de captación/reclutamiento
    // si no llega un owner explícito.
    let defaultOwnerId = body.default_owner_id as string | undefined;
    if (!input.owner_id && !defaultOwnerId) {
      // Campaña única de reclutamiento (las legacy se migraron a hazte_colaborador).
      const isCollaboratorLead = !!input.collaborator_id || !!input.referred_by_collaborator_id;
      const isRecruitmentLead = input.campaign === 'hazte_colaborador';
      if (isCollaboratorLead || isRecruitmentLead) {
        const { data: settings } = await supabase
          .from('collaborator_settings')
          .select('collaborator_manager_id')
          .eq('id', 1)
          .maybeSingle();
        const managerId = (settings as { collaborator_manager_id?: string | null } | null)
          ?.collaborator_manager_id;
        if (managerId) {
          // Verifica que el responsable conserve un rol válido; si lo perdió, no se asigna
          // (el lead queda sin owner en vez de asignarse a alguien que ya no gestiona).
          const { data: roleRow } = await supabase
            .from('user_roles')
            .select('user_id')
            .eq('user_id', managerId)
            .in('role', ['commercial', 'admin'])
            .limit(1)
            .maybeSingle();
          if (roleRow) {
            defaultOwnerId = managerId;
          } else {
            console.warn(`[leads] responsable de colaboradores ${managerId} sin rol válido; lead sin asignar`);
          }
        }
      }
    }

    const result = await createLead(supabase, input, {
      defaultOwnerId,
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
