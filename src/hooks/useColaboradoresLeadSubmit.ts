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
  try {
    const apiUrl = import.meta.env.VITE_RESOLVE_COLLABORATOR_REF_API_URL ?? '/api/resolve-collaborator-ref';
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: refToken }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      collaborator?: { id: string } | null;
    };
    return data.collaborator?.id ?? null;
  } catch {
    return null;
  }
}

function readRecruitRefFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const ref = new URLSearchParams(window.location.search).get('ref');
  return ref?.trim() || null;
}

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
  const recruitRef = useMemo(() => readRecruitRefFromUrl(), []);
  const utmSource = useMemo(() => readUtmSourceFromUrl(), []);

  const submit = useCallback(
    async (e: React.FormEvent, state: ColaboradoresLeadFormState) => {
      e.preventDefault();
      if (!state.nombre.trim() || !state.tel.trim() || sending) return;

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
