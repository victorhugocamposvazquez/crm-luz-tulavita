/**
 * Utilidades para el formulario landing
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function getUrlParams(): { source?: string; campaign?: string; adset?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('source') ?? undefined,
    campaign: params.get('campaign') ?? undefined,
    adset: params.get('adset') ?? undefined,
  };
}
