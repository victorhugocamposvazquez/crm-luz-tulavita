export function createReferralToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 10)}`;
}

export function createAccessToken(): string {
  return `portal_${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 14)}`;
}
