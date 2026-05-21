import type { CollaboratorEntryMode } from './types';
import { COLABORADORES_RECRUITMENT_ROUTE } from '@/components/colaboradores/colaboradores-config';

export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function buildClientCaptureUrl(
  baseUrl: string,
  opts: { token?: string; code?: string; entryMode?: CollaboratorEntryMode },
): string {
  const url = new URL('/ahorra-factura-luz', baseUrl || 'https://crm.virvita.es');
  if (opts.token) {
    url.searchParams.set('ref', opts.token);
  } else if (opts.code) {
    url.searchParams.set('collaborator', opts.code);
    if (opts.entryMode && opts.entryMode !== 'auto') {
      url.searchParams.set('entry', opts.entryMode);
    }
  }
  return url.toString();
}

export function buildRecruitmentUrl(baseUrl: string, recruitToken?: string): string {
  const url = new URL(COLABORADORES_RECRUITMENT_ROUTE, baseUrl || 'https://crm.virvita.es');
  if (recruitToken) url.searchParams.set('ref', recruitToken);
  return url.toString();
}

export function buildPortalUrl(baseUrl: string, accessToken: string): string {
  const url = new URL('/colaborador/acceso', baseUrl || 'https://crm.virvita.es');
  url.searchParams.set('token', accessToken);
  return url.toString();
}
