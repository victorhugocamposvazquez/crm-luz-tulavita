/**
 * Webhook para Meta Lead Ads
 * Configurar en Meta Business: Webhooks > Leads > URL de este endpoint
 * Meta envía POST con formato específico; transformamos y llamamos a create-lead
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Verificación de webhook (Meta envía GET con hub.mode, hub.verify_token)
const META_VERIFY_TOKEN = Deno.env.get('META_LEAD_VERIFY_TOKEN') ?? 'tu_token_secreto';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  // GET: verificación de webhook por Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
      return new Response(challenge ?? 'ok', {
        status: 200,
        headers: { ...cors, 'Content-Type': 'text/plain' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const body = await req.json();

    // Formato Meta Lead Ads: { object: 'page', entry: [{ id, time, changes: [{ value: { leadgen_id, form_id, ... } }] }] }
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.leadgen_id) {
      return new Response(JSON.stringify({ error: 'Formato Meta Lead Ads inválido' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Registrar import para auditoría
    const { data: importRow } = await supabase
      .from('lead_imports')
      .insert({
        source: 'meta_lead_ads',
        raw_payload: body,
        status: 'pending',
      })
      .select('id')
      .single();

    // Extraer campos del lead (Meta envía field_data con name/value)
    const fieldData = value?.field_data ?? [];
    const fields: Record<string, string> = {};
    for (const f of fieldData) {
      if (f?.name && f?.value != null) fields[f.name] = String(f.value);
    }

    const phone = fields['phone_number'] ?? fields['phone'] ?? fields['telefono'] ?? null;
    const email = fields['email'] ?? fields['correo'] ?? null;
    const name = fields['full_name'] ?? fields['first_name'] ?? fields['name'] ?? null;

    if (!phone && !email) {
      await supabase
        .from('lead_imports')
        .update({ status: 'error', error: 'Sin phone ni email' })
        .eq('id', importRow?.id);
      return new Response(JSON.stringify({ error: 'Lead sin phone ni email' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Normalizar para consistencia con createLead
    function normPhone(p: string): string {
      const d = p.replace(/\D/g, '');
      if (/^[679]\d{8}$/.test(d)) return `+34${d}`;
      if (/^34[679]\d{8}$/.test(d)) return `+${d}`;
      return d.length >= 9 ? `+${d.startsWith('34') ? d : '34' + d}` : p;
    }
    const normPhoneStr = phone ? normPhone(phone) : null;
    const normEmailStr = email ? email.trim().toLowerCase() : null;

    // Deduplicar: phone primero, luego email
    let existingId: string | null = null;
    if (normPhoneStr) {
      const { data: byPhone } = await supabase.from('leads').select('id').eq('phone', normPhoneStr).limit(1).maybeSingle();
      if (byPhone?.id) existingId = byPhone.id;
    }
    if (!existingId && normEmailStr) {
      const { data: byEmail } = await supabase.from('leads').select('id').eq('email', normEmailStr).limit(1).maybeSingle();
      if (byEmail?.id) existingId = byEmail.id;
    }

    let leadId: string;
    let isNew: boolean;

    if (existingId) {
      const { error } = await supabase.from('leads').update({
        name: name ?? undefined,
        source: 'meta_lead_ads',
        campaign: value?.ad_id ?? undefined,
        adset: value?.adset_id ?? undefined,
        ad: value?.form_id ?? undefined,
        custom_fields: fields,
      }).eq('id', existingId);
      if (error) {
        await supabase.from('lead_imports').update({ status: 'error', error: error.message }).eq('id', importRow?.id);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await supabase.from('lead_events').insert({ lead_id: existingId, type: 'lead_updated', content: { source: 'meta_lead_ads', meta_payload: value } });
      leadId = existingId;
      isNew = false;
    } else {
      const { data: inserted, error } = await supabase.from('leads').insert({
        name: name ?? null,
        phone: normPhoneStr ?? null,
        email: normEmailStr ?? null,
        source: 'meta_lead_ads',
        campaign: value?.ad_id ?? null,
        adset: value?.adset_id ?? null,
        ad: value?.form_id ?? null,
        status: 'new',
        tags: ['meta_lead_ads'],
        custom_fields: fields,
      }).select('id').single();
      if (error) {
        await supabase.from('lead_imports').update({ status: 'error', error: error.message }).eq('id', importRow?.id);
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      await supabase.from('lead_events').insert({ lead_id: inserted.id, type: 'lead_created', content: { source: 'meta_lead_ads', meta_payload: value } });
      leadId = inserted.id;
      isNew = true;
    }

    await supabase.from('lead_imports').update({ status: 'success' }).eq('id', importRow?.id);

    return new Response(JSON.stringify({ success: true, lead_id: leadId, isNew }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[meta-lead-webhook]', e);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
