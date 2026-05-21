import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { resolvePortalToken } from '../server-lib/collaborators/portal-auth.js';

type EntryMode = 'auto' | 'upload' | 'manual' | 'callback';

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

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    cors(res);
    res.status(400).json({ success: false, error: 'token es requerido' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const resolved = await resolvePortalToken(supabase, token);
    if (!resolved) {
      cors(res);
      res.status(401).json({ success: false, error: 'Token inválido o expirado' });
      return;
    }

    const { collaborator } = resolved;

    const { count: leadsCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('collaborator_id', collaborator.id);

    const { count: convertedCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('collaborator_id', collaborator.id)
      .eq('status', 'converted');

    const { data: pendingPayouts } = await supabase
      .from('collaborator_payouts')
      .select('id, amount_total_eur, leads_count, status, created_at')
      .eq('collaborator_id', collaborator.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    const { data: commissionInvoices } = await supabase
      .from('collaborator_invoices')
      .select('id, payout_id, file_name, invoice_number, amount_eur, status, rejection_reason, submitted_at')
      .eq('collaborator_id', collaborator.id)
      .order('submitted_at', { ascending: false })
      .limit(50);

    const { data: referralLinks } = await supabase
      .from('collaborator_referral_links')
      .select('id, token, entry_mode, is_active, expires_at, label, created_at')
      .eq('collaborator_id', collaborator.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: capturedClients } = await supabase
      .from('leads')
      .select(
        'id, name, phone, email, status, created_at, custom_fields, energy_comparisons(id, status, estimated_savings_percentage, estimated_savings_amount, error_message, created_at)',
      )
      .eq('collaborator_id', collaborator.id)
      .eq('source', 'collaborator_referral')
      .order('created_at', { ascending: false })
      .limit(50);

    cors(res);
    res.status(200).json({
      success: true,
      collaborator: {
        id: collaborator.id,
        code: collaborator.code,
        name: collaborator.name,
        commission_per_converted_eur: collaborator.commission_per_converted_eur,
        email: collaborator.email,
        phone: collaborator.phone,
      },
      stats: {
        leads_total: leadsCount ?? 0,
        leads_converted: convertedCount ?? 0,
      },
      pending_payouts: pendingPayouts ?? [],
      commission_invoices: commissionInvoices ?? [],
      referral_links: (referralLinks ?? []).map((l) => ({
        ...l,
        entry_mode: (l.entry_mode ?? 'auto') as EntryMode,
      })),
      captured_clients: (capturedClients ?? []).map((row) => {
        const comparisons = Array.isArray(row.energy_comparisons) ? row.energy_comparisons : [];
        const latest = comparisons.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )[0] ?? null;
        const cf = row.custom_fields as Record<string, unknown> | null;
        const adj = cf?.adjuntar_factura;
        const hasInvoice =
          (adj &&
            typeof adj === 'object' &&
            typeof (adj as { path?: string }).path === 'string' &&
            (adj as { path: string }).path.trim().length > 0) ||
          !!cf?.manual_extraction;
        return {
          id: row.id,
          name: row.name,
          phone: row.phone,
          email: row.email,
          status: row.status,
          created_at: row.created_at,
          has_invoice: hasInvoice,
          comparison_status: latest?.status ?? null,
          estimated_savings_percentage: latest?.estimated_savings_percentage ?? null,
          estimated_savings_amount: latest?.estimated_savings_amount ?? null,
        };
      }),
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/resolve-collaborator-portal]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
}
