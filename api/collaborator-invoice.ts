/**
 * POST /api/collaborator-invoice — facturas de comisión del portal colaborador.
 * Acciones (query `action` o body `action`): upload (default) | file | delete
 * Compat: /api/collaborator-invoice-file y /api/collaborator-invoice-delete vía rewrites en vercel.json
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePortalToken } from '../server-lib/collaborators/portal-auth.js';
import { applyPortalCors, createPortalServiceClient } from '../server-lib/collaborators/portal-http.js';

const BUCKET = 'collaborator-documents';
const MAX_BASE64_BYTES = 8 * 1024 * 1024;

type InvoiceAction = 'upload' | 'file' | 'delete';

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

function resolveAction(req: VercelRequest, body: Record<string, unknown>): InvoiceAction {
  const fromQuery = typeof req.query.action === 'string' ? req.query.action : null;
  const fromBody = typeof body.action === 'string' ? body.action : null;
  const raw = fromQuery ?? fromBody ?? 'upload';
  if (raw === 'file' || raw === 'delete') return raw;
  return 'upload';
}

async function handleUpload(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  res: VercelResponse,
): Promise<void> {
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  const payoutId = typeof body.payout_id === 'string' ? body.payout_id : '';
  const fileBase64 = typeof body.file_base64 === 'string' ? body.file_base64.trim() : '';
  const invoiceNumber = typeof body.invoice_number === 'string' ? body.invoice_number.trim() : null;
  const amountEur = typeof body.amount_eur === 'number' ? body.amount_eur : Number.parseFloat(String(body.amount_eur ?? ''));

  if (!accessToken || !payoutId || !fileBase64) {
    res.status(400).json({ success: false, error: 'access_token, payout_id y file_base64 son requeridos' });
    return;
  }

  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
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
    res.status(404).json({ success: false, error: 'Liquidación no encontrada' });
    return;
  }

  if (payout.status !== 'pending') {
    res.status(400).json({ success: false, error: 'Solo se pueden subir facturas para liquidaciones pendientes' });
    return;
  }

  const { data: activeInvoice } = await supabase
    .from('collaborator_invoices')
    .select('id')
    .eq('payout_id', payoutId)
    .in('status', ['submitted', 'approved'])
    .maybeSingle();

  if (activeInvoice) {
    res.status(400).json({
      success: false,
      error: 'Ya hay una factura activa para esta liquidación. Anúlala antes de subir otra.',
    });
    return;
  }

  const parsed = parseBase64(fileBase64);
  if (!parsed) {
    res.status(400).json({ success: false, error: 'Archivo inválido o demasiado grande' });
    return;
  }

  const fileName = typeof body.file_name === 'string' ? body.file_name : 'factura-comision.pdf';
  const objectPath = `${collaborator.id}/${payoutId}/${crypto.randomUUID()}_${fileName.replace(/[^\w.\-]+/g, '_')}`;

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

  res.status(200).json({ success: true, invoice });
}

async function handleFile(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  res: VercelResponse,
): Promise<void> {
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id.trim() : '';

  if (!accessToken || !invoiceId) {
    res.status(400).json({ success: false, error: 'access_token e invoice_id son requeridos' });
    return;
  }

  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  const { data: invoice, error } = await supabase
    .from('collaborator_invoices')
    .select('id, file_path, status')
    .eq('id', invoiceId)
    .eq('collaborator_id', resolved.collaborator.id)
    .maybeSingle();

  if (error || !invoice?.file_path) {
    res.status(404).json({ success: false, error: 'Factura no encontrada' });
    return;
  }

  if (invoice.status === 'cancelled') {
    res.status(400).json({ success: false, error: 'Esta factura fue anulada' });
    return;
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(invoice.file_path, 3600);

  if (signErr || !signed?.signedUrl) {
    res.status(500).json({ success: false, error: 'No se pudo abrir el archivo' });
    return;
  }

  res.status(200).json({ success: true, signed_url: signed.signedUrl });
}

async function handleDelete(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
  res: VercelResponse,
): Promise<void> {
  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!accessToken || !invoiceId) {
    res.status(400).json({ success: false, error: 'access_token e invoice_id son requeridos' });
    return;
  }
  if (reason.length < 5) {
    res.status(400).json({ success: false, error: 'Indica el motivo de la anulación (mínimo 5 caracteres)' });
    return;
  }

  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
    res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    return;
  }

  const { collaborator } = resolved;

  const { data: invoice, error: invErr } = await supabase
    .from('collaborator_invoices')
    .select('id, collaborator_id, payout_id, file_path, status')
    .eq('id', invoiceId)
    .eq('collaborator_id', collaborator.id)
    .maybeSingle();

  if (invErr || !invoice) {
    res.status(404).json({ success: false, error: 'Factura no encontrada' });
    return;
  }

  if (!['submitted', 'rejected'].includes(invoice.status)) {
    res.status(400).json({
      success: false,
      error: 'Solo puedes anular facturas recibidas o rechazadas que aún no están pagadas',
    });
    return;
  }

  if (invoice.file_path) {
    await supabase.storage.from(BUCKET).remove([invoice.file_path]);
  }

  const { error: updateErr } = await supabase
    .from('collaborator_invoices')
    .update({
      status: 'cancelled',
      rejection_reason: `[Anulada por colaborador] ${reason}`,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);

  if (updateErr) throw updateErr;

  res.status(200).json({ success: true });
}

export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  applyPortalCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const supabase = createPortalServiceClient();
  if (!supabase) {
    res.status(500).json({ success: false, error: 'Configuración Supabase incompleta' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    res.status(400).json({ success: false, error: 'JSON inválido' });
    return;
  }

  const action = resolveAction(req, body);

  try {
    if (action === 'file') {
      await handleFile(supabase, body, res);
      return;
    }
    if (action === 'delete') {
      await handleDelete(supabase, body, res);
      return;
    }
    await handleUpload(supabase, body, res);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(`[api/collaborator-invoice:${action}]`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
