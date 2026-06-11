/** Token de sesión del portal; se crea únicamente al verificar el OTP por email. */
export function createAccessToken(): string {
  return `portal_${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 14)}`;
}
