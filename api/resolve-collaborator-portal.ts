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

    const { data: referralLinks } = await supabase
      .from('collaborator_referral_links')
      .select('id, token, entry_mode, is_active, expires_at, label, created_at')
      .eq('collaborator_id', collaborator.id)
      .order('created_at', { ascending: false })
      .limit(20);

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
      referral_links: (referralLinks ?? []).map((l) => ({
        ...l,
        entry_mode: (l.entry_mode ?? 'auto') as EntryMode,
      })),
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[api/resolve-collaborator-portal]', err.message);
    cors(res);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
}
