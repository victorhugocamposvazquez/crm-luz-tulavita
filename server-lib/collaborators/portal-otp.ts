import { createHash } from 'node:crypto';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutos
export const OTP_MAX_ATTEMPTS = 5; // intentos de verificación por código
export const OTP_MAX_PER_HOUR = 5; // códigos solicitables por email/hora
export const SESSION_TTL_DAYS = 60; // duración de la sesión tras verificar

/** Código numérico de 6 dígitos (string con ceros a la izquierda). */
export function generateOtpCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

/**
 * Hash del código ligado al colaborador. Nunca guardamos el código en claro.
 * Un secreto opcional en entorno (COLLABORATOR_OTP_SECRET) refuerza el hash.
 */
export function hashOtp(code: string, collaboratorId: string): string {
  const secret = process.env.COLLABORATOR_OTP_SECRET?.trim() ?? '';
  return createHash('sha256').update(`${collaboratorId}:${code}:${secret}`).digest('hex');
}

/** Comparación en tiempo constante para evitar timing attacks. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function normalizeOtpInput(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '').slice(0, 6) : '';
}
