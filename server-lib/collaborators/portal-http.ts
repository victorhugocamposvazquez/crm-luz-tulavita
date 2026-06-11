import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * CORS restringido al propio origen: las APIs de colaboradores solo se
 * consumen desde la propia app (frontend y /api comparten dominio en Vercel).
 * Las peticiones cross-origin no reciben cabeceras CORS y el navegador las
 * bloquea.
 */
export function applyPortalCors(req: VercelRequest, res: VercelResponse): void {
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Cliente Supabase con service role obligatorio. Sin fallback a anon key:
 * con las políticas RLS endurecidas, anon no puede leer tokens y las APIs
 * fallarían de formas confusas; mejor fallar explícitamente en configuración.
 */
export function createPortalServiceClient(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
