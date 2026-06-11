import { useCallback, useMemo, useState } from 'react';
import {
  COLABORADORES_RECRUITMENT_CAMPAIGN,
} from '@/components/colaboradores/colaboradores-config';
import { useMetaAttribution } from '@/hooks/useMetaAttribution';

export type ColaboradoresLeadFormState = {
  nombre: string;
  tel: string;
  email: string;
};

async function resolveRecruitReferrer(refToken: string): Promise<string | null> {
  const apiUrl = import.meta.env.VITE_RESOLVE_COLLABORATOR_REF_API_URL ?? '/api/resolve-collaborator-ref';
  // Un reintento: si falla, el lead se envía igualmente con recruit_ref_token en
  // custom_fields para poder atribuirlo a mano después.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: refToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        collaborator?: { id: string } | null;
      };
      if (res.ok) return data.collaborator?.id ?? null;
    } catch {
      /* reintentar */
    }
  }
  return null;
}

const RECRUIT_REF_STORAGE_KEY = 'crm_luz_recruit_ref';

/** Lee ?ref= de la URL y lo persiste en sessionStorage para no perderlo al navegar/recargar. */
function readRecruitRef(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('ref')?.trim() || null;
  if (fromUrl) {
    try {
      sessionStorage.setItem(RECRUIT_REF_STORAGE_KEY, fromUrl);
    } catch {
      /* sessionStorage no disponible */
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(RECRUIT_REF_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Teléfono español (móvil o fijo): 9 dígitos empezando por 6/7/8/9, con +34/34 opcional. */
export function isValidSpanishPhone(raw: string): boolean {
  const digits = raw.replace(/[\s\-().]/g, '').replace(/^\+?34/, '');
  return /^[6789]\d{8}$/.test(digits);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readUtmSourceFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('utm_source');
  return v?.trim() || null;
}

export function useColaboradoresLeadSubmit() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const { attribution } = useMetaAttribution();
  const recruitRef = useMemo(() => readRecruitRef(), []);
  const utmSource = useMemo(() => readUtmSourceFromUrl(), []);

  const submit = useCallback(
    async (e: React.FormEvent, state: ColaboradoresLeadFormState) => {
      e.preventDefault();
      if (sending) return;
      if (!state.nombre.trim() || !state.tel.trim()) return;
      if (!isValidSpanishPhone(state.tel)) {
        setError('Introduce un teléfono español válido (9 dígitos).');
        return;
      }
      if (state.email.trim() && !EMAIL_RE.test(state.email.trim())) {
        setError('El email no tiene un formato válido.');
        return;
      }

      setSending(true);
      setError(null);

      try {
        const referredById = recruitRef ? await resolveRecruitReferrer(recruitRef) : null;

        const customFields: Record<string, unknown> = {
          landing_type: 'colaboradores',
          ...(utmSource ? { utm_source: utmSource } : {}),
          ...(attribution.campaign ? { utm_campaign: attribution.campaign } : {}),
          ...(attribution.adset ? { utm_term: attribution.adset } : {}),
          ...(attribution.ad ? { utm_content: attribution.ad } : {}),
          ...(recruitRef ? { recruit_ref_token: recruitRef } : {}),
          ...(referredById ? { referred_by_collaborator_id: referredById } : {}),
        };

        const payload: Record<string, unknown> = {
          name: state.nombre.trim(),
          phone: state.tel.trim(),
          email: state.email.trim() || undefined,
          source: 'web_form',
          campaign: COLABORADORES_RECRUITMENT_CAMPAIGN,
          adset: attribution.adset ?? undefined,
          ad: attribution.ad ?? undefined,
          custom_fields: customFields,
        };

        if (referredById) {
          payload.referred_by_collaborator_id = referredById;
        }

        const res = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          lead?: { id: string };
        };

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'No se pudo enviar la solicitud');
        }

        if (data.lead?.id) {
          await fetch('/api/lead-entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lead_id: data.lead.id,
              source: 'web_form',
              campaign: COLABORADORES_RECRUITMENT_CAMPAIGN,
              adset: attribution.adset ?? null,
              ad: attribution.ad ?? null,
              custom_fields: customFields,
            }),
          }).catch(() => {});
        }

        setSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
      } finally {
        setSending(false);
      }
    },
    [sending, attribution, recruitRef, utmSource],
  );

  return { submit, sending, error, sent, setSent };
}
