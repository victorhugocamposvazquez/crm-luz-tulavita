const STORAGE_KEY = 'tulavita_collaborator_portal_token';

export function getPortalSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const value = localStorage.getItem(STORAGE_KEY)?.trim();
  return value && value.length >= 32 ? value : null;
}

export function setPortalSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, token.trim());
}

export function clearPortalSession(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

/** Extrae el token desde un enlace completo o un token portal_... pegado directamente. */
export function extractPortalToken(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes('token=')) {
    try {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://local${trimmed.startsWith('/') ? '' : '/'}${trimmed}`);
      const fromQuery = url.searchParams.get('token')?.trim();
      if (fromQuery && fromQuery.length >= 32) return fromQuery;
    } catch {
      const match = trimmed.match(/[?&]token=([^&]+)/);
      const fromMatch = match?.[1]?.trim();
      if (fromMatch && fromMatch.length >= 32) return decodeURIComponent(fromMatch);
    }
  }

  if (trimmed.startsWith('portal_') && trimmed.length >= 32) return trimmed;
  return null;
}
