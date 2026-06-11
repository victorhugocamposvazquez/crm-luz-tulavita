/**
 * POST /api/collaborator-submit-lead
 * Colaborador registra cliente desde portal (token de autoservicio).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolvePortalToken } from '../server-lib/collaborators/portal-auth.js';
import { applyPortalCors, createPortalServiceClient } from '../server-lib/collaborators/portal-http.js';

const LEAD_BUCKET = 'lead-attachments';
const MAX_BASE64_BYTES = 8 * 1024 * 1024;

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return 'unknown';
}

function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');
  if (/^[679]\d{8}$/.test(cleaned)) return `+34${cleaned}`;
  if (/^34[679]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+34[679]\d{8}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 9 && /^[679]/.test(digits)) return `+34${digits}`;
  if (digits.length >= 6) return digits;
  return null;
}

function parseBase64Attachment(raw: string): { buffer: Buffer; mime: string; ext: string } | null {
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const b64 = match ? match[2] : raw;
  const mime = match?.[1] ?? 'application/octet-stream';
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BASE64_BYTES) return null;
    let ext = 'bin';
    if (mime.includes('pdf')) ext = 'pdf';
    else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
    else if (mime.includes('png')) ext = 'png';
    else if (mime.includes('webp')) ext = 'webp';
    return { buffer, mime, ext };
  } catch {
    return null;
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = (r: VercelResponse) => applyPortalCors(req, r);
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

  const supabase = createPortalServiceClient();
  if (!supabase) {
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

  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  if (!accessToken) {
    cors(res);
    res.status(400).json({ success: false, error: 'access_token es requerido' });
    return;
  }

  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
    cors(res);
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  const { collaborator } = resolved;
  const phone = normalizePhone(typeof body.phone === 'string' ? body.phone : undefined);
  const email =
    typeof body.email === 'string' && body.email.includes('@') ? body.email.trim().toLowerCase() : null;
  const name = typeof body.name === 'string' ? body.name.trim() : null;

  if (!phone && !email) {
    cors(res);
    res.status(400).json({ success: false, error: 'Se requiere teléfono o email' });
    return;
  }

  const entryMode =
    typeof body.entry_mode === 'string' &&
    ['auto', 'upload', 'manual', 'callback'].includes(body.entry_mode)
      ? body.entry_mode
      : 'upload';

  const manualExtraction =
    body.manual_extraction && typeof body.manual_extraction === 'object' && !Array.isArray(body.manual_extraction)
      ? (body.manual_extraction as Record<string, unknown>)
      : null;

  const ip = getClientIp(req);
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('collaborator_lead_rate_log')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= 30) {
    cors(res);
    res.status(429).json({ success: false, error: 'Demasiadas solicitudes. Intenta más tarde.' });
    return;
  }

  try {
    const customFields: Record<string, unknown> = {
      submitted_via: 'collaborator_portal',
      entry_mode: entryMode,
    };

    let attachmentPath: string | null = null;
    const attachmentName = typeof body.attachment_name === 'string' ? body.attachment_name : 'factura.pdf';
    if (typeof body.attachment_base64 === 'string' && body.attachment_base64.trim()) {
      const parsed = parseBase64Attachment(body.attachment_base64.trim());
      if (!parsed) {
        cors(res);
        res.status(400).json({ success: false, error: 'Archivo adjunto inválido o demasiado grande' });
        return;
      }
      attachmentPath = `${crypto.randomUUID()}/${attachmentName.replace(/[^\w.\-]+/g, '_')}`;
      const { error: upErr } = await supabase.storage
        .from(LEAD_BUCKET)
        .upload(attachmentPath, parsed.buffer, {
          contentType: parsed.mime,
          upsert: false,
        });
      if (upErr) throw upErr;
      customFields.adjuntar_factura = { name: attachmentName, path: attachmentPath };
    }

    if (manualExtraction) {
      customFields.manual_extraction = manualExtraction;
    }

    // Asignar al responsable de colaboradores si está configurado.
    let ownerId: string | null = null;
    {
      const { data: settings } = await supabase
        .from('collaborator_settings')
        .select('collaborator_manager_id')
        .eq('id', 1)
        .maybeSingle();
      const managerId =
        (settings as { collaborator_manager_id?: string | null } | null)?.collaborator_manager_id ??
        null;
      if (managerId) {
        // Solo se asigna si el responsable conserva un rol válido.
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('user_id', managerId)
          .in('role', ['commercial', 'admin'])
          .limit(1)
          .maybeSingle();
        ownerId = roleRow ? managerId : null;
      }
    }

    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        name,
        phone,
        email,
        source: 'collaborator_referral',
        campaign: `collaborator:${collaborator.code}`,
        collaborator_id: collaborator.id,
        status: 'new',
        owner_id: ownerId,
        custom_fields: customFields,
      })
      .select('id')
      .single();

    if (leadErr) throw leadErr;

    await supabase.from('lead_entries').insert({
      lead_id: lead.id,
      source: 'collaborator_referral',
      collaborator_id: collaborator.id,
      campaign: `collaborator:${collaborator.code}`,
      custom_fields: { submitted_via: 'collaborator_portal', entry_mode: entryMode },
    });

    await supabase.from('lead_conversations').insert({
      lead_id: lead.id,
      channel: 'whatsapp',
      status: 'open',
    });

    await supabase.from('collaborator_lead_rate_log').insert({
      ip,
      collaborator_id: collaborator.id,
    });

    let processInvoiceResult = null;
    if (attachmentPath || manualExtraction) {
      const processBody: Record<string, unknown> = { lead_id: lead.id };
      if (attachmentPath) processBody.attachment_path = attachmentPath;
      if (manualExtraction) processBody.manual_extraction = manualExtraction;

      const baseUrl =
        process.env.VERCEL_URL != null
          ? `https://${process.env.VERCEL_URL}`
          : process.env.VITE_APP_URL ?? 'http://localhost:5173';

      try {
        const procRes = await fetch(`${baseUrl}/api/process-invoice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(processBody),
        });
        processInvoiceResult = await procRes.json().catch(() => null);
      } catch {
        /* no bloquear creación del lead */
      }
    }

    cors(res);
    res.status(200).json({
      success: true,
      lead_id: lead.id,
      attachment_path: attachmentPath,
      process_invoice: processInvoiceResult,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/collaborator-submit-lead]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: err.message });
  }
}
