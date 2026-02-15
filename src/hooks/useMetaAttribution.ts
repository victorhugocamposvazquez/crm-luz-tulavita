/**
 * Hook para atribución de campañas Meta (utm_*, fbclid).
 * Prioridad: URL → localStorage. Se limpia tras envío exitoso del lead.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'crm_luz_meta_attribution';

export interface MetaAttribution {
  source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
}

function getFromUrl(): MetaAttribution | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const utm_source = params.get('utm_source') ?? undefined;
  const utm_campaign = params.get('utm_campaign') ?? undefined;
  const utm_content = params.get('utm_content') ?? undefined;
  const utm_term = params.get('utm_term') ?? undefined;
  const fbclid = params.get('fbclid') ?? undefined;

  if (!utm_source && !utm_campaign && !utm_content && !utm_term && !fbclid) {
    return null;
  }

  const source =
    (utm_source?.toLowerCase().includes('facebook') || !!fbclid) ? 'meta_ads_web' : 'web_form';

  return {
    source,
    campaign: utm_campaign ?? undefined,
    adset: utm_term ?? undefined,
    ad: utm_content ?? undefined,
  };
}

function getFromStorage(): MetaAttribution {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as MetaAttribution;
    return {
      source: parsed?.source,
      campaign: parsed?.campaign,
      adset: parsed?.adset,
      ad: parsed?.ad,
    };
  } catch {
    return {};
  }
}

export function useMetaAttribution(): {
  attribution: MetaAttribution;
  clearAttribution: () => void;
} {
  const [attribution, setAttribution] = useState<MetaAttribution>(() => {
    const fromUrl = getFromUrl();
    if (fromUrl && Object.keys(fromUrl).length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fromUrl));
      } catch {
        // ignore
      }
      return fromUrl;
    }
    return getFromStorage();
  });

  const clearAttribution = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setAttribution({});
  }, []);

  return { attribution, clearAttribution };
}
