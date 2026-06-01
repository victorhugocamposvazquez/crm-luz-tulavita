/**
 * POST /api/collaborator-portal-otp
 * Acceso al portal del colaborador por código de un solo uso (OTP) enviado al
 * email registrado.
 *
 *   { action: 'request', email }          -> envía un código de 6 dígitos
 *   { action: 'verify', email, code }     -> valida el código y devuelve un
 *                                            token de sesión del portal
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createAccessToken } from '../server-lib/collaborators/portal-links.js';
import { sendResendEmail } from '../server-lib/email/resend.js';
import {
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_MAX_PER_HOUR,
  SESSION_TTL_DAYS,
  generateOtpCode,
  hashOtp,
  safeEqual,
  normalizeOtpInput,
} from '../server-lib/collaborators/portal-otp.js';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const GENERIC_REQUEST_OK =
  'Si tu email está registrado como colaborador, recibirás un código de acceso en breve. Revisa también la carpeta de spam.';

function buildOtpEmail(name: string, code: string) {
  return {
    subject: `${code} es tu código de acceso · Portal colaborador Tulavita`,
    text: `Hola ${name},\n\nTu código de acceso al portal de colaboradores es:\n\n${code}\n\nCaduca en 10 minutos y solo puede usarse una vez. Si no lo has solicitado, ignora este mensaje.\n\nTulavita Energía`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;">
        <p>Hola <strong>${name}</strong>,</p>
        <p>Tu código de acceso al portal de colaboradores de Tulavita es:</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f4f7ee;border:1px solid #e2e8d4;border-radius:12px;padding:16px;text-align:center;color:#3f6212;">${code}</p>
        <p style="font-size:13px;color:#666;">Caduca en 10 minutos y solo puede usarse una vez.</p>
        <p style="font-size:12px;color:#999;">Si no has solicitado este código, puedes ignorar este email.</p>
        <p style="font-size:13px;color:#666;">Tulavita Energía</p>
      </div>
    `,
  };
}

function getClientIp(req: VercelRequest): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim() || null;
  if (Array.isArray(fwd)) return fwd[0] ?? null;
  return null;
}

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

  const action = typeof body.action === 'string' ? body.action : '';
  const email = normalizeEmail(body.email);
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    if (action === 'request') {
      if (!email || !email.includes('@')) {
        cors(res);
        res.status(400).json({ success: false, error: 'Introduce un email válido' });
        return;
      }

      const { data: collaborator, error: collabError } = await supabase
        .from('collaborators')
        .select('id, name, email, is_active')
        .eq('is_active', true)
        .ilike('email', email)
        .maybeSingle();
      if (collabError) throw collabError;

      // No revelamos si el email existe o no.
      if (!collaborator?.email) {
        cors(res);
        res.status(200).json({ success: true, message: GENERIC_REQUEST_OK, delivery: 'unknown' });
        return;
      }

      // Rate limit por email/hora.
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentCount, error: countError } = await supabase
        .from('collaborator_otp_codes')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .gte('created_at', oneHourAgo);
      if (countError) throw countError;

      if ((recentCount ?? 0) >= OTP_MAX_PER_HOUR) {
        cors(res);
        res.status(200).json({ success: true, message: GENERIC_REQUEST_OK, delivery: 'unknown' });
        return;
      }

      const code = generateOtpCode();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
      const { error: insertError } = await supabase.from('collaborator_otp_codes').insert({
        collaborator_id: collaborator.id,
        email,
        code_hash: hashOtp(code, collaborator.id),
        expires_at: expiresAt,
        ip: getClientIp(req),
      });
      if (insertError) throw insertError;

      const tpl = buildOtpEmail(collaborator.name ?? 'colaborador/a', code);
      const sendResult = await sendResendEmail({ to: collaborator.email, ...tpl });
      if (!sendResult.sent) {
        console.info('[collaborator-portal-otp] email not sent', {
          collaboratorId: collaborator.id,
          reason: sendResult.reason,
        });
      }

      cors(res);
      res.status(200).json({
        success: true,
        message: GENERIC_REQUEST_OK,
        delivery: sendResult.sent ? 'email' : 'manual',
      });
      return;
    }

    if (action === 'verify') {
      const code = normalizeOtpInput(body.code);
      if (!email || code.length !== 6) {
        cors(res);
        res.status(400).json({ success: false, error: 'Introduce tu email y el código de 6 dígitos' });
        return;
      }

      const { data: otpRow, error: otpError } = await supabase
        .from('collaborator_otp_codes')
        .select('id, collaborator_id, code_hash, expires_at, attempts, consumed_at')
        .eq('email', email)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (otpError) throw otpError;

      if (!otpRow) {
        cors(res);
        res.status(400).json({ success: false, error: 'Código incorrecto o caducado. Solicita uno nuevo.' });
        return;
      }

      if (otpRow.attempts >= OTP_MAX_ATTEMPTS) {
        cors(res);
        res.status(429).json({ success: false, error: 'Demasiados intentos. Solicita un código nuevo.' });
        return;
      }

      const expected = otpRow.code_hash;
      const provided = hashOtp(code, otpRow.collaborator_id);
      if (!safeEqual(expected, provided)) {
        await supabase
          .from('collaborator_otp_codes')
          .update({ attempts: otpRow.attempts + 1 })
          .eq('id', otpRow.id);
        cors(res);
        res.status(400).json({ success: false, error: 'Código incorrecto. Revisa el email e inténtalo de nuevo.' });
        return;
      }

      // Comprobar que el colaborador sigue activo.
      const { data: collaborator, error: collabError } = await supabase
        .from('collaborators')
        .select('id, is_active')
        .eq('id', otpRow.collaborator_id)
        .maybeSingle();
      if (collabError) throw collabError;
      if (!collaborator?.is_active) {
        cors(res);
        res.status(403).json({ success: false, error: 'Tu cuenta de colaborador no está activa.' });
        return;
      }

      // Consumir el código y crear la sesión (token con expiración).
      await supabase
        .from('collaborator_otp_codes')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', otpRow.id);

      const token = createAccessToken();
      const sessionExpiry = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { error: tokenError } = await supabase.from('collaborator_access_tokens').insert({
        collaborator_id: otpRow.collaborator_id,
        token,
        is_active: true,
        expires_at: sessionExpiry,
        label: 'Sesión (acceso por email)',
      });
      if (tokenError) throw tokenError;

      cors(res);
      res.status(200).json({ success: true, token });
      return;
    }

    cors(res);
    res.status(400).json({ success: false, error: 'Acción no válida' });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/collaborator-portal-otp]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: 'No se pudo procesar la solicitud' });
  }
}
