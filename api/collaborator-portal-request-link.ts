/**
 * POST /api/collaborator-portal-request-link
 * Solicita un nuevo magic link del portal por email o teléfono registrado.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createAccessToken, buildPortalUrl } from '../server-lib/collaborators/portal-links.js';
import { sendResendEmail } from '../server-lib/email/resend.js';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function getAppBaseUrl(): string {
  const configured = process.env.VITE_APP_URL || process.env.APP_URL || process.env.VERCEL_URL;
  if (configured) {
    const withProtocol = configured.startsWith('http') ? configured : `https://${configured}`;
    return withProtocol.replace(/\/$/, '');
  }
  return 'https://crm.virvita.es';
}

const GENERIC_OK_MESSAGE =
  'Si tus datos están registrados como colaborador, recibirás un nuevo enlace de acceso en breve. Revisa también spam.';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    cors(res);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    cors(res);
    res.status(500).json({ success: false, error: 'Configuración Supabase incompleta' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    cors(res);
    res.status(400).json({ success: false, error: 'JSON inválido' });
    return;
  }

  const emailRaw = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const phoneRaw = typeof body.phone === 'string' ? normalizePhone(body.phone) : '';

  if (!emailRaw && phoneRaw.length < 9) {
    cors(res);
    res.status(400).json({ success: false, error: 'Introduce el email o teléfono registrado como colaborador' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    let query = supabase
      .from('collaborators')
      .select('id, name, email, phone, is_active')
      .eq('is_active', true);

    if (emailRaw) {
      query = query.ilike('email', emailRaw);
    } else {
      query = query.not('phone', 'is', null);
    }

    const { data: rows, error } = await query.limit(5);
    if (error) throw error;

    let collaborator = rows?.[0] ?? null;
    if (!emailRaw && phoneRaw) {
      collaborator =
        rows?.find((row) => row.phone && normalizePhone(row.phone).endsWith(phoneRaw.slice(-9))) ?? null;
    }

    if (!collaborator) {
      cors(res);
      res.status(200).json({
        success: true,
        message: GENERIC_OK_MESSAGE,
        delivery: 'unknown',
      });
      return;
    }

    const token = createAccessToken();
    const { error: tokenError } = await supabase.from('collaborator_access_tokens').insert({
      collaborator_id: collaborator.id,
      token,
      is_active: true,
      expires_at: null,
      label: 'Recuperación de acceso',
    });
    if (tokenError) throw tokenError;

    const portalUrl = buildPortalUrl(getAppBaseUrl(), token);
    const targetEmail = collaborator.email?.trim().toLowerCase();

    let delivery: 'email' | 'manual' | 'unknown' = 'unknown';
    let message = GENERIC_OK_MESSAGE;

    if (targetEmail && emailRaw && targetEmail === emailRaw) {
      const sendResult = await sendResendEmail({
        to: targetEmail,
        subject: 'Tu enlace de acceso al portal colaborador Tulavita',
        text: `Hola ${collaborator.name},\n\nEste es tu nuevo enlace de acceso al portal de colaboradores:\n${portalUrl}\n\nSi no has solicitado este enlace, ignora este mensaje.\n\nTulavita Energía`,
        html: `
          <p>Hola <strong>${collaborator.name}</strong>,</p>
          <p>Has solicitado un nuevo enlace de acceso al portal de colaboradores de Tulavita.</p>
          <p><a href="${portalUrl}" style="display:inline-block;padding:12px 20px;background:#84cc16;color:#111;text-decoration:none;border-radius:8px;font-weight:600;">Acceder al portal</a></p>
          <p style="word-break:break-all;font-size:12px;color:#666;">${portalUrl}</p>
          <p style="font-size:12px;color:#666;">Si no has solicitado este enlace, puedes ignorar este email.</p>
          <p>Tulavita Energía</p>
        `,
      });

      if (sendResult.sent) {
        delivery = 'email';
      } else {
        delivery = 'manual';
        message =
          'Hemos generado tu acceso, pero el envío automático por email no está disponible ahora. Contacta con Tulavita por WhatsApp indicando tu email registrado.';
        console.info('[collaborator-portal-request-link] email not sent', {
          collaboratorId: collaborator.id,
          reason: sendResult.reason,
          portalUrl,
        });
      }
    } else if (targetEmail && !emailRaw) {
      const sendResult = await sendResendEmail({
        to: targetEmail,
        subject: 'Tu enlace de acceso al portal colaborador Tulavita',
        text: `Hola ${collaborator.name},\n\nHas solicitado recuperar el acceso al portal con tu teléfono registrado.\n\n${portalUrl}\n\nTulavita Energía`,
        html: `
          <p>Hola <strong>${collaborator.name}</strong>,</p>
          <p>Has solicitado recuperar el acceso al portal con tu teléfono registrado.</p>
          <p><a href="${portalUrl}">${portalUrl}</a></p>
          <p>Tulavita Energía</p>
        `,
      });
      delivery = sendResult.sent ? 'email' : 'manual';
      if (!sendResult.sent) {
        message =
          'Hemos encontrado tu cuenta, pero no pudimos enviarte el email automáticamente. Escríbenos por WhatsApp.';
      }
    } else {
      delivery = 'manual';
      message =
        'Hemos encontrado tu cuenta, pero no tienes email registrado. Contacta con Tulavita por WhatsApp para recibir tu enlace.';
    }

    cors(res);
    res.status(200).json({
      success: true,
      message,
      delivery,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/collaborator-portal-request-link]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: 'No se pudo procesar la solicitud' });
  }
}
