import type { CollaboratorEntryMode } from './types';
import {
  COLABORADORES_RECRUITMENT_CAMPAIGN,
  COLABORADORES_RECRUITMENT_ROUTE,
} from '@/components/colaboradores/colaboradores-config';

export function getAppBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Parámetros UTM estándar para medir campañas/canales de difusión. */
export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

function applyUtmParams(url: URL, utm?: UtmParams): void {
  if (!utm) return;
  if (utm.source) url.searchParams.set('utm_source', utm.source);
  if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
  if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
  if (utm.term) url.searchParams.set('utm_term', utm.term);
  if (utm.content) url.searchParams.set('utm_content', utm.content);
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

export function buildRecruitmentUrl(
  baseUrl: string,
  opts: { recruitToken?: string; utm?: UtmParams } = {},
): string {
  const url = new URL(COLABORADORES_RECRUITMENT_ROUTE, baseUrl || 'https://crm.virvita.es');
  if (opts.recruitToken) url.searchParams.set('ref', opts.recruitToken);
  applyUtmParams(url, opts.utm);
  return url.toString();
}

/**
 * Canales típicos para repartir QR / enlaces de captación de colaboradores.
 * Cada canal mapea a un conjunto de UTM coherente para medir el origen.
 */
export interface RecruitmentChannel {
  id: string;
  label: string;
  utm: UtmParams;
}

export const RECRUITMENT_CHANNELS: RecruitmentChannel[] = [
  {
    id: 'meta_ads',
    label: 'Meta Ads (Facebook/Instagram)',
    utm: { source: 'facebook', medium: 'cpc', campaign: COLABORADORES_RECRUITMENT_CAMPAIGN },
  },
  {
    id: 'instagram_bio',
    label: 'Instagram (bio/stories)',
    utm: { source: 'instagram', medium: 'social', campaign: COLABORADORES_RECRUITMENT_CAMPAIGN },
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    utm: { source: 'whatsapp', medium: 'mensaje', campaign: COLABORADORES_RECRUITMENT_CAMPAIGN },
  },
  {
    id: 'cartel',
    label: 'Cartel / QR físico',
    utm: { source: 'cartel', medium: 'qr', campaign: COLABORADORES_RECRUITMENT_CAMPAIGN },
  },
  {
    id: 'flyer',
    label: 'Flyer / folleto',
    utm: { source: 'flyer', medium: 'qr', campaign: COLABORADORES_RECRUITMENT_CAMPAIGN },
  },
];

/** URL de reclutamiento para un canal concreto (con UTM y, opcionalmente, referidor). */
export function buildRecruitmentChannelUrl(
  baseUrl: string,
  channel: RecruitmentChannel,
  recruitToken?: string,
): string {
  return buildRecruitmentUrl(baseUrl, { recruitToken, utm: channel.utm });
}

export function buildPortalLoginUrl(baseUrl: string): string {
  return new URL('/colaborador/acceso', baseUrl || 'https://crm.virvita.es').toString();
}
