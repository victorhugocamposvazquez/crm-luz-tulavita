/**
 * POST /api/collaborator-invoice-delete — anular factura de comisión subida por error.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolvePortalToken } from '../server-lib/collaborators/portal-auth.js';

const BUCKET = 'collaborator-documents';

function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  const accessToken = typeof body.access_token === 'string' ? body.access_token.trim() : '';
  const invoiceId = typeof body.invoice_id === 'string' ? body.invoice_id.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (!accessToken || !invoiceId) {
    cors(res);
    res.status(400).json({ success: false, error: 'access_token e invoice_id son requeridos' });
    return;
  }
  if (reason.length < 5) {
    cors(res);
    res.status(400).json({ success: false, error: 'Indica el motivo de la anulación (mínimo 5 caracteres)' });
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

  const { data: invoice, error: invErr } = await supabase
    .from('collaborator_invoices')
    .select('id, collaborator_id, payout_id, file_path, status')
    .eq('id', invoiceId)
    .eq('collaborator_id', collaborator.id)
    .maybeSingle();

  if (invErr || !invoice) {
    cors(res);
    res.status(404).json({ success: false, error: 'Factura no encontrada' });
    return;
  }

  if (!['submitted', 'rejected'].includes(invoice.status)) {
    cors(res);
    res.status(400).json({
      success: false,
      error: 'Solo puedes anular facturas recibidas o rechazadas que aún no están pagadas',
    });
    return;
  }

  try {
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

    cors(res);
    res.status(200).json({ success: true });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/collaborator-invoice-delete]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: err.message });
  }
}
