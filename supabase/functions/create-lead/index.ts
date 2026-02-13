/**
 * Edge Function: create-lead
 * Endpoint único para leads. Invocar: POST /functions/v1/create-lead
 * Alternativa al api/leads.ts de Vercel (misma lógica)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helpers inline para Deno (evitar imports cross-env)
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
  const t = email.trim().toLowerCase();
  return t.length > 0 && t.includes('@') ? t : null;
}

function normalizeName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const t = name.trim();
  return t.length > 0 ? t : null;
}

const SOURCES = new Set(['web_form', 'meta_lead_ads', 'meta_ads_web', 'csv_import', 'manual']);
function normalizeSource(s: string | undefined | null): string {
  if (!s || typeof s !== 'string') return 'manual';
  const l = s.trim().toLowerCase();
  if (SOURCES.has(l)) return l;
  if (['meta', 'facebook', 'instagram', 'lead ads'].some((x) => l.includes(x))) return 'meta_lead_ads';
  if (['meta ads', 'facebook ads', 'tráfico'].some((x) => l.includes(x))) return 'meta_ads_web';
  if (['form', 'formulario', 'landing', 'web'].some((x) => l.includes(x))) return 'web_form';
  if (['csv', 'excel', 'import'].some((x) => l.includes(x))) return 'csv_import';
  return 'manual';
}

async function findExisting(sb: ReturnType<typeof createClient>, phone: string | null, email: string | null) {
  if (phone) {
    const { data } = await sb.from('leads').select('id').eq('phone', phone).limit(1).maybeSingle();
    if (data?.id) return { id: data.id, by: 'phone' as const };
  }
  if (email) {
    const { data } = await sb.from('leads').select('id').eq('email', email).limit(1).maybeSingle();
    if (data?.id) return { id: data.id, by: 'email' as const };
  }
  return null;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body = await req.json();
    const phone = normalizePhone(body.phone);
    const email = normalizeEmail(body.email);
    const name = normalizeName(body.name);
    const source = normalizeSource(body.source);

    if (!phone && !email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Se requiere al menos teléfono o email', code: 'VALIDATION_ERROR' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const existing = await findExisting(supabase, phone, email);

    if (existing) {
      const { data: updated, error } = await supabase
        .from('leads')
        .update({
          name: name ?? undefined,
          phone: phone ?? undefined,
          email: email ?? undefined,
          source,
          campaign: body.campaign ?? undefined,
          adset: body.adset ?? undefined,
          ad: body.ad ?? undefined,
          tags: body.tags ?? undefined,
          custom_fields: body.custom_fields ?? undefined,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message, code: 'UPDATE_ERROR' }),
          { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.from('lead_events').insert({
        lead_id: existing.id,
        type: 'lead_updated',
        content: { matchBy: existing.by, updatedFields: body, source },
      });

      return new Response(
        JSON.stringify({ success: true, lead: updated, isNew: false, eventType: 'lead_updated' }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const ownerId = body.owner_id ?? body.default_owner_id ?? null;

    const { data: inserted, error } = await supabase
      .from('leads')
      .insert({
        name,
        phone,
        email,
        source,
        campaign: body.campaign ?? null,
        adset: body.adset ?? null,
        ad: body.ad ?? null,
        status: body.status ?? 'new',
        owner_id: ownerId,
        tags: body.tags ?? [],
        custom_fields: body.custom_fields ?? {},
      })
      .select()
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message, code: 'INSERT_ERROR' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    await supabase.from('lead_events').insert({
      lead_id: inserted.id,
      type: 'lead_created',
      content: { source, campaign: body.campaign, adset: body.adset, ad: body.ad },
    });

    return new Response(
      JSON.stringify({ success: true, lead: inserted, isNew: true, eventType: 'lead_created' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('[create-lead]', e);
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
});
