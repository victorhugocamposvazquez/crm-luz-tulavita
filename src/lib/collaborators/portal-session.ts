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
