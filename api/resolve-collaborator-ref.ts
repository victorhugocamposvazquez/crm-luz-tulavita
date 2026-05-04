import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type EntryMode = 'auto' | 'upload' | 'manual' | 'callback';

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  if (req.method === 'OPTIONS') {
    cors();
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    cors();
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    cors();
    res.status(500).json({ success: false, error: 'Configuración Supabase incompleta', code: 'CONFIG_ERROR' });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  let body: Record<string, unknown>;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body as Record<string, unknown>) ?? {};
  } catch {
    cors();
    res.status(400).json({ success: false, error: 'JSON inválido', code: 'INVALID_JSON' });
    return;
  }

  const code = normalizeCode(body.code ?? body.collaborator ?? body.colaborador ?? body.collaborator_id);
  const token = normalizeCode(body.ref ?? body.token);

  try {
    if (token) {
      const { data, error } = await supabase
        .from('collaborator_referral_links')
        .select('entry_mode, expires_at, collaborators!inner(id, code, name, is_active)')
        .eq('token', token)
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      const row = data as {
        entry_mode?: EntryMode;
        expires_at?: string | null;
        collaborators?: { id: string; code: string; name: string; is_active: boolean };
      } | null;
      const collab = row?.collaborators;
      const expired = !!(row?.expires_at && new Date(row.expires_at).getTime() <= Date.now());
      if (collab && collab.is_active && !expired) {
        cors();
        res.status(200).json({
          success: true,
          collaborator: { id: collab.id, code: collab.code, name: collab.name },
          entry_mode: row?.entry_mode ?? 'auto',
        });
        return;
      }
    }

    if (!code) {
      cors();
      res.status(200).json({ success: true, collaborator: null, entry_mode: 'auto' as EntryMode });
      return;
    }

    const { data, error } = await supabase
      .from('collaborators')
      .select('id, code, name, is_active')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      cors();
      res.status(200).json({ success: true, collaborator: null, entry_mode: 'auto' as EntryMode });
      return;
    }

    cors();
    res.status(200).json({
      success: true,
      collaborator: { id: data.id, code: data.code, name: data.name },
      entry_mode: 'auto' as EntryMode,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[resolve-collaborator-ref]', err.message, err.stack);
    cors();
    res.status(500).json({
      success: false,
      error: process.env.NODE_ENV === 'development' ? err.message : 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}
