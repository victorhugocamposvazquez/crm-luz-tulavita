/**
 * POST /api/collaborator-invoice-file — URL firmada para ver factura de comisión propia.
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

  if (!accessToken || !invoiceId) {
    cors(res);
    res.status(400).json({ success: false, error: 'access_token e invoice_id son requeridos' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const resolved = await resolvePortalToken(supabase, accessToken);
  if (!resolved) {
    cors(res);
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
    cors(res);
    res.status(404).json({ success: false, error: 'Factura no encontrada' });
    return;
  }

  if (invoice.status === 'cancelled') {
    cors(res);
    res.status(400).json({ success: false, error: 'Esta factura fue anulada' });
    return;
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(invoice.file_path, 3600);

  if (signErr || !signed?.signedUrl) {
    cors(res);
    res.status(500).json({ success: false, error: 'No se pudo abrir el archivo' });
    return;
  }

  cors(res);
  res.status(200).json({ success: true, signed_url: signed.signedUrl });
}
