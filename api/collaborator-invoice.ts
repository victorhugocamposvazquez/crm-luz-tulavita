/**
 * POST /api/collaborator-invoice — subir factura de comisión vinculada a liquidación.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolvePortalToken } from '../server-lib/collaborators/portal-auth.js';

const BUCKET = 'collaborator-documents';
const MAX_BASE64_BYTES = 8 * 1024 * 1024;

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseBase64(raw: string): { buffer: Buffer; mime: string } | null {
  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  const b64 = match ? match[2] : raw;
  const mime = match?.[1] ?? 'application/pdf';
  try {
    const buffer = Buffer.from(b64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BASE64_BYTES) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

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

  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  const payoutId = typeof body.payout_id === 'string' ? body.payout_id : '';
  const fileBase64 = typeof body.file_base64 === 'string' ? body.file_base64.trim() : '';
  const invoiceNumber = typeof body.invoice_number === 'string' ? body.invoice_number.trim() : null;
  const amountEur = typeof body.amount_eur === 'number' ? body.amount_eur : Number.parseFloat(String(body.amount_eur ?? ''));

  if (!accessToken || !payoutId || !fileBase64) {
    cors(res);
    res.status(400).json({ success: false, error: 'access_token, payout_id y file_base64 son requeridos' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
    cors(res);
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  const { collaborator } = resolved;

  const { data: payout, error: payoutErr } = await supabase
    .from('collaborator_payouts')
    .select('id, collaborator_id, status, amount_total_eur')
    .eq('id', payoutId)
    .eq('collaborator_id', collaborator.id)
    .maybeSingle();

  if (payoutErr || !payout) {
    cors(res);
    res.status(404).json({ success: false, error: 'Liquidación no encontrada' });
    return;
  }

  if (payout.status !== 'pending') {
    cors(res);
    res.status(400).json({ success: false, error: 'Solo se pueden subir facturas para liquidaciones pendientes' });
    return;
  }

  const parsed = parseBase64(fileBase64);
  if (!parsed) {
    cors(res);
    res.status(400).json({ success: false, error: 'Archivo inválido o demasiado grande' });
    return;
  }

  const fileName = typeof body.file_name === 'string' ? body.file_name : 'factura-comision.pdf';
  const objectPath = `${collaborator.id}/${payoutId}/${crypto.randomUUID()}_${fileName.replace(/[^\w.\-]+/g, '_')}`;

  try {
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(objectPath, parsed.buffer, {
      contentType: parsed.mime,
      upsert: false,
    });
    if (upErr) throw upErr;

    const { data: invoice, error: invErr } = await supabase
      .from('collaborator_invoices')
      .insert({
        collaborator_id: collaborator.id,
        payout_id: payoutId,
        file_path: objectPath,
        file_name: fileName,
        invoice_number: invoiceNumber,
        amount_eur: Number.isFinite(amountEur) ? amountEur : payout.amount_total_eur,
        status: 'submitted',
      })
      .select('id, status, submitted_at')
      .single();

    if (invErr) {
      await supabase.storage.from(BUCKET).remove([objectPath]);
      throw invErr;
    }

    cors(res);
    res.status(200).json({ success: true, invoice });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/collaborator-invoice]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: err.message });
  }
}
