/**
 * Normalizador de datos de leads (copia para API Vercel)
 */

import type { LeadSource } from './types.js';

const LEAD_SOURCES_SET = new Set<string>([
  'web_form',
  'meta_lead_ads',
  'meta_ads_web',
  'csv_import',
  'manual',
]);

export function normalizePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== 'string') return null;

  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '').replace(/^00/, '+');

  if (/^[679]\d{8}$/.test(cleaned)) return `+34${cleaned}`;
  if (/^34[679]\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^\+34[679]\d{8}$/.test(cleaned)) return cleaned;
  if (/^\+\d{10,15}$/.test(cleaned)) return cleaned;

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) {
    return digits.startsWith('34') ? `+${digits}` : `+34${digits}`;
  }

  return null;
}

export function normalizeEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 && trimmed.includes('@') ? trimmed : null;
}

export function normalizeName(name: string | undefined | null): string | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

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
