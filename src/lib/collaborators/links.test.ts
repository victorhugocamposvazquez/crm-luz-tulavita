import { describe, expect, it } from 'vitest';
import {
  buildClientCaptureUrl,
  buildRecruitmentUrl,
  buildRecruitmentChannelUrl,
  buildPortalUrl,
  RECRUITMENT_CHANNELS,
} from './links';

const BASE = 'https://crm.example.com';

describe('buildClientCaptureUrl', () => {
  it('usa el token firmado (ref) cuando se proporciona', () => {
    const url = new URL(buildClientCaptureUrl(BASE, { token: 'tok123' }));
    expect(url.pathname).toBe('/ahorra-factura-luz');
    expect(url.searchParams.get('ref')).toBe('tok123');
    expect(url.searchParams.get('collaborator')).toBeNull();
  });

  it('usa el code directo y el entry mode (omitiendo auto)', () => {
    const direct = new URL(buildClientCaptureUrl(BASE, { code: 'ABC', entryMode: 'upload' }));
    expect(direct.searchParams.get('collaborator')).toBe('ABC');
    expect(direct.searchParams.get('entry')).toBe('upload');

    const auto = new URL(buildClientCaptureUrl(BASE, { code: 'ABC', entryMode: 'auto' }));
    expect(auto.searchParams.get('entry')).toBeNull();
  });

  it('prioriza el token sobre el code', () => {
    const url = new URL(buildClientCaptureUrl(BASE, { token: 'tok', code: 'ABC' }));
    expect(url.searchParams.get('ref')).toBe('tok');
    expect(url.searchParams.get('collaborator')).toBeNull();
  });
});

describe('buildRecruitmentUrl', () => {
  it('apunta a la landing de reclutamiento sin parámetros por defecto', () => {
    const url = new URL(buildRecruitmentUrl(BASE));
    expect(url.pathname).toBe('/hazte-colaborador');
    expect([...url.searchParams.keys()]).toHaveLength(0);
  });

  it('añade ref y UTM cuando se pasan', () => {
    const url = new URL(
      buildRecruitmentUrl(BASE, { recruitToken: 'r1', utm: { source: 'facebook', medium: 'cpc' } }),
    );
    expect(url.searchParams.get('ref')).toBe('r1');
    expect(url.searchParams.get('utm_source')).toBe('facebook');
    expect(url.searchParams.get('utm_medium')).toBe('cpc');
  });
});

describe('buildRecruitmentChannelUrl', () => {
  it('cada canal genera UTM coherentes y campaña de reclutamiento', () => {
    for (const channel of RECRUITMENT_CHANNELS) {
      const url = new URL(buildRecruitmentChannelUrl(BASE, channel));
      expect(url.pathname).toBe('/hazte-colaborador');
      expect(url.searchParams.get('utm_source')).toBe(channel.utm.source ?? null);
      expect(url.searchParams.get('utm_campaign')).toBe('hazte_colaborador');
    }
  });

  it('incluye el referidor cuando se proporciona', () => {
    const url = new URL(buildRecruitmentChannelUrl(BASE, RECRUITMENT_CHANNELS[0], 'rt'));
    expect(url.searchParams.get('ref')).toBe('rt');
  });

  it('los ids de canal son únicos', () => {
    const ids = RECRUITMENT_CHANNELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('buildPortalUrl', () => {
  it('genera la ruta de acceso con el token', () => {
    const url = new URL(buildPortalUrl(BASE, 'acc1'));
    expect(url.pathname).toBe('/colaborador/acceso');
    expect(url.searchParams.get('token')).toBe('acc1');
  });
});
