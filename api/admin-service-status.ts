/**
 * GET /api/admin-service-status
 * Estado de salud de los servicios externos que usa el CRM (Supabase, OpenAI,
 * Resend, Mapbox). Solo accesible por administradores.
 *
 * No expone secretos: solo si están configurados, si responden y qué cuota/
 * detalle público devuelven. Cada check tiene timeout para no colgar la página.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { applySameOriginCors } from '../server-lib/http.js';

type ServiceStatus = 'operational' | 'degraded' | 'down' | 'not_configured' | 'unknown';

type ServiceResult = {
  id: string;
  name: string;
  category: string;
  status: ServiceStatus;
  configured: boolean;
  detail: string;
  latencyMs: number | null;
  docsUrl?: string;
};


async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

// ── Checks individuales ──────────────────────────────────────────

async function checkSupabase(url?: string, key?: string): Promise<ServiceResult> {
  const base: ServiceResult = {
    id: 'supabase',
    name: 'Supabase',
    category: 'Base de datos y almacenamiento',
    status: 'unknown',
    configured: !!(url && key),
    detail: '',
    latencyMs: null,
    docsUrl: 'https://supabase.com/dashboard',
  };
  if (!url || !key) {
    return { ...base, status: 'not_configured', detail: 'Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' };
  }
  try {
    const supabase = createClient(url, key);
    const { ms } = await timed(async () => {
      const { error } = await supabase.from('collaborators').select('id', { count: 'exact', head: true });
      if (error) throw error;
    });
    return { ...base, status: 'operational', detail: 'Conexión y consulta correctas.', latencyMs: ms };
  } catch (e) {
    return { ...base, status: 'down', detail: e instanceof Error ? e.message : 'Error de conexión.' };
  }
}

async function checkOpenAI(key?: string): Promise<ServiceResult> {
  const base: ServiceResult = {
    id: 'openai',
    name: 'OpenAI',
    category: 'Análisis de facturas (IA)',
    status: 'unknown',
    configured: !!key,
    detail: '',
    latencyMs: null,
    docsUrl: 'https://platform.openai.com/usage',
  };
  if (!key) {
    return { ...base, status: 'not_configured', detail: 'Falta OPENAI_API_KEY. El análisis de facturas no funcionará.' };
  }
  try {
    const { value: resp, ms } = await timed(() =>
      fetchWithTimeout('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key}` } }),
    );
    if (resp.ok) {
      return { ...base, status: 'operational', detail: 'Clave válida y API accesible.', latencyMs: ms };
    }
    if (resp.status === 401) {
      return { ...base, status: 'down', detail: 'Clave inválida o revocada (401).', latencyMs: ms };
    }
    if (resp.status === 429) {
      return {
        ...base,
        status: 'degraded',
        detail: 'Límite de uso o saldo agotado (429). Revisa el crédito en OpenAI.',
        latencyMs: ms,
      };
    }
    return { ...base, status: 'degraded', detail: `Respuesta inesperada (HTTP ${resp.status}).`, latencyMs: ms };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ...base, status: 'down', detail: aborted ? 'Tiempo de espera agotado.' : 'No se pudo contactar con OpenAI.' };
  }
}

async function checkResend(key?: string): Promise<ServiceResult> {
  const base: ServiceResult = {
    id: 'resend',
    name: 'Resend',
    category: 'Envío de emails',
    status: 'unknown',
    configured: !!key,
    detail: '',
    latencyMs: null,
    docsUrl: 'https://resend.com/domains',
  };
  if (!key) {
    return {
      ...base,
      status: 'not_configured',
      detail: 'Falta RESEND_API_KEY. No se enviarán códigos de acceso ni emails.',
    };
  }
  try {
    const { value: resp, ms } = await timed(() =>
      fetchWithTimeout('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${key}` } }),
    );
    if (resp.ok) {
      const data = (await resp.json()) as { data?: Array<{ name?: string; status?: string }> };
      const domains = data.data ?? [];
      const verified = domains.filter((d) => d.status === 'verified');
      if (domains.length === 0) {
        return {
          ...base,
          status: 'degraded',
          detail: 'Clave válida pero sin dominios. Usa onboarding@resend.dev o verifica un dominio.',
          latencyMs: ms,
        };
      }
      if (verified.length === 0) {
        return {
          ...base,
          status: 'degraded',
          detail: `Dominio(s) sin verificar: ${domains.map((d) => d.name).join(', ')}.`,
          latencyMs: ms,
        };
      }
      return {
        ...base,
        status: 'operational',
        detail: `Operativo. Dominio(s) verificado(s): ${verified.map((d) => d.name).join(', ')}.`,
        latencyMs: ms,
      };
    }
    if (resp.status === 401 || resp.status === 403) {
      return { ...base, status: 'down', detail: 'Clave inválida o sin permisos (401/403).', latencyMs: ms };
    }
    return { ...base, status: 'degraded', detail: `Respuesta inesperada (HTTP ${resp.status}).`, latencyMs: ms };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return { ...base, status: 'down', detail: aborted ? 'Tiempo de espera agotado.' : 'No se pudo contactar con Resend.' };
  }
}

// ── Verificación de admin ────────────────────────────────────────

async function isAdminRequest(req: VercelRequest, url: string, serviceKey: string): Promise<boolean> {
  const auth = req.headers.authorization;
  const jwt = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!jwt) return false;
  try {
    const supabase = createClient(url, serviceKey);
    const { data: userData, error } = await supabase.auth.getUser(jwt);
    if (error || !userData.user) return false;
    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();
    return !!roleRow;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const cors = (r: VercelResponse) => applySameOriginCors(req, r);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    cors(res);
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    cors(res);
    res.status(500).json({ success: false, error: 'Configuración Supabase incompleta en el servidor' });
    return;
  }

  const admin = await isAdminRequest(req, supabaseUrl, serviceKey);
  if (!admin) {
    cors(res);
    res.status(403).json({ success: false, error: 'Solo administradores' });
    return;
  }

  const [supabase, openai, resend] = await Promise.all([
    checkSupabase(supabaseUrl, serviceKey),
    checkOpenAI(process.env.OPENAI_API_KEY?.trim()),
    checkResend(process.env.RESEND_API_KEY?.trim()),
  ]);

  const services: ServiceResult[] = [supabase, openai, resend];

  cors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ success: true, checkedAt: new Date().toISOString(), services });
}
