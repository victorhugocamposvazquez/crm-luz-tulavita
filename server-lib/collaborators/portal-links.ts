export function createAccessToken(): string {
  return `portal_${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 14)}`;
}

export function buildPortalUrl(baseUrl: string, accessToken: string): string {
  const url = new URL('/colaborador/acceso', baseUrl || 'https://crm.virvita.es');
  url.searchParams.set('token', accessToken);
  return url.toString();
}
