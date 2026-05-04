/**
 * POST /functions/v1/send-reminder-web-push
 * Header: x-cron-secret: REMINDER_PUSH_CRON_SECRET
 *
 * Secretos (Dashboard → Edge Functions):
 * - REMINDER_PUSH_CRON_SECRET (cadena aleatoria)
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)
 * - VAPID_SUBJECT (ej. mailto:admin@tudominio.com)
 *
 * Programar invocación cada 1–2 min (Supabase scheduled trigger o cron externo).
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as webPush from 'npm:web-push@3.6.6';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

type SubRow = { endpoint: string; p256dh: string; auth: string };

type ReminderRow = {
  id: string;
  reminder_kind: string | null;
  custom_label: string | null;
  client: { nombre_apellidos: string } | null;
};

function kindLabel(kind: string | null | undefined, custom: string | null | undefined): string {
  switch (kind) {
    case 'contract_end':
      return 'Fin de contrato';
    case 'recontact':
      return 'Recontactar';
    case 'custom':
      return (custom && custom.trim()) || 'Otro';
    default:
      return 'Renovación';
  }
}

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

  const secret = Deno.env.get('REMINDER_PUSH_CRON_SECRET');
  const hdr = req.headers.get('x-cron-secret');
  if (!secret || hdr !== secret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: subsRaw, error: subsError } = await supabase
    .from('admin_web_push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (subsError) {
    return new Response(JSON.stringify({ error: subsError.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  if (!subsRaw?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: 'no subscribers' }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const activeSubs: SubRow[] = subsRaw.map((s) => s as SubRow);

  const nowIso = new Date().toISOString();
  const { data: reminders, error: remError } = await supabase
    .from('renewal_reminders')
    .select('id, reminder_kind, custom_label, client:clients(nombre_apellidos)')
    .eq('status', 'pending')
    .is('web_push_sent_at', null)
    .lte('reminder_date', nowIso)
    .order('reminder_date', { ascending: true })
    .limit(40);

  if (remError) {
    return new Response(JSON.stringify({ error: remError.message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let marked = 0;

  for (const r of (reminders || []) as ReminderRow[]) {
    if (activeSubs.length === 0) break;

    const name = r.client?.nombre_apellidos?.trim() || 'Cliente';
    const motivo = kindLabel(r.reminder_kind, r.custom_label);
    const payload = JSON.stringify({
      title: 'Recordatorio CRM',
      body: `${name} — ${motivo}`,
      url: '/dashboard',
    });

    let anyOk = false;
    const dead = new Set<string>();

    for (const s of activeSubs) {
      try {
        await webPush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 86400 },
        );
        anyOk = true;
      } catch (e: unknown) {
        const statusCode =
          typeof e === 'object' && e !== null && 'statusCode' in e
            ? (e as { statusCode: number }).statusCode
            : 0;
        if (statusCode === 410 || statusCode === 404) {
          dead.add(s.endpoint);
        }
      }
    }

    if (dead.size) {
      await supabase.from('admin_web_push_subscriptions').delete().in('endpoint', [...dead]);
      for (let i = activeSubs.length - 1; i >= 0; i--) {
        if (dead.has(activeSubs[i].endpoint)) {
          activeSubs.splice(i, 1);
        }
      }
    }

    if (anyOk) {
      await supabase
        .from('renewal_reminders')
        .update({ web_push_sent_at: nowIso })
        .eq('id', r.id);
      marked += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      candidates: (reminders || []).length,
      marked,
      subscribers: activeSubs.length,
    }),
    { headers: { ...cors, 'Content-Type': 'application/json' } },
  );
});
