import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * CORS restringido al propio origen: las APIs públicas solo se consumen desde
 * la propia app (frontend y /api comparten dominio en Vercel). Las peticiones
 * cross-origin no reciben cabeceras CORS y el navegador las bloquea.
 */
export function applySameOriginCors(req: VercelRequest, res: VercelResponse): void {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  let sameOrigin = false;
  if (origin && host) {
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  }
  if (sameOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Cliente Supabase con service role obligatorio. Sin fallback a anon key:
 * mejor fallar explícitamente en configuración que operar con permisos
 * inesperados.
 */
export function createServiceClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Valida que la petición trae un JWT de Supabase de un usuario con rol admin.
 * Para endpoints de uso interno del CRM (p. ej. simulador de facturas).
 */
export async function requireAdminUser(
  req: VercelRequest,
  supabase: SupabaseClient,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const auth = req.headers.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, error: 'Autenticación requerida' };
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Sesión inválida o caducada' };
  }
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('user_id', data.user.id)
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();
  if (!roleRow) {
    return { ok: false, status: 403, error: 'Se requiere rol de administrador' };
  }
  return { ok: true, userId: data.user.id };
}

export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string') return real.trim();
  return 'unknown';
}
