/**
 * Normalizador de datos de leads
 * Garantiza formato consistente para deduplicación y almacenamiento
 */

import type { LeadSource } from './types';

const LEAD_SOURCES_SET = new Set<string>([
  'web_form',
  'meta_lead_ads',
  'meta_ads_web',
  'csv_import',
  'manual',
]);

/**
 * Normaliza teléfono a formato internacional E.164
 * España: +34 + 9 dígitos
 * Elimina espacios, guiones, paréntesis
 */
export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;

  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');

  // Si empieza por 6 o 7 (móvil España) o 9 (fijo), añadir +34
  if (/^[679]\d{8}$/.test(cleaned)) {
    return `+34${cleaned}`;
  }
  if (/^34[679]\d{8}$/.test(cleaned)) {
    return `+${cleaned}`;
  }
  if (/^\+34[679]\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  // Formato genérico: si tiene + y dígitos, devolver
  if (/^\+\d{10,15}$/.test(cleaned)) {
    return cleaned;
  }

  // Fallback: devolver solo dígitos con + si parece válido
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) {
    return digits.startsWith('34') ? `+${digits}` : `+34${digits}`;
  }

  return null;
}

/**
 * Normaliza email: lowercase, trim
 */
export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}

/**
 * Normaliza nombre: trim, capitalización básica
 */
export function normalizeName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Estandariza source a valores conocidos
 */
export function normalizeSource(source: string | undefined | null): LeadSource {
  if (!source || typeof source !== 'string') return 'manual';

  const lower = source.trim().toLowerCase();

  if (LEAD_SOURCES_SET.has(lower)) return lower as LeadSource;
  if (['meta', 'facebook', 'instagram', 'lead ads'].some((s) => lower.includes(s)))
    return 'meta_lead_ads';
  if (['meta ads', 'facebook ads', 'tráfico'].some((s) => lower.includes(s)))
    return 'meta_ads_web';
  if (['form', 'formulario', 'landing', 'web'].some((s) => lower.includes(s)))
    return 'web_form';
  if (['csv', 'excel', 'import'].some((s) => lower.includes(s))) return 'csv_import';

  return 'manual';
}

/**
 * Normaliza todo el input de un lead
 */
export function normalizeLeadInput<T extends Record<string, unknown>>(input: T): T {
  const result = { ...input } as T;

  if ('phone' in result && result.phone != null) {
    (result as Record<string, unknown>).phone = normalizePhone(
      String(result.phone)
    );
  }
  if ('email' in result && result.email != null) {
    (result as Record<string, unknown>).email = normalizeEmail(
      String(result.email)
    );
  }
  if ('name' in result && result.name != null) {
    (result as Record<string, unknown>).name = normalizeName(String(result.name));
  }
  if ('source' in result && result.source != null) {
    (result as Record<string, unknown>).source = normalizeSource(
      String(result.source)
    );
  }

  return result;
}
