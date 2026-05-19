import { useCallback, useState } from 'react';
import type { ColaboradoresLandingVariant } from '@/components/colaboradores/colaboradores-config';
import { COLABORADORES_CAMPAIGNS } from '@/components/colaboradores/colaboradores-config';

export type ColaboradoresLeadFormState = {
  nombre: string;
  tel: string;
  email: string;
};

export function useColaboradoresLeadSubmit(variant: ColaboradoresLandingVariant) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent, state: ColaboradoresLeadFormState) => {
      e.preventDefault();
      if (!state.nombre.trim() || !state.tel.trim() || sending) return;

      setSending(true);
      setError(null);

      try {
        const payload = {
          name: state.nombre.trim(),
          phone: state.tel.trim(),
          email: state.email.trim() || undefined,
          source: 'web_form',
          campaign: COLABORADORES_CAMPAIGNS[variant],
          custom_fields: {
            landing_type: 'colaboradores',
            landing_variant: variant,
          },
        };

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
            body: JSON.stringify({ lead_id: data.lead.id, source: 'web_form' }),
          }).catch(() => {});
        }

        setSent(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
      } finally {
        setSending(false);
      }
    },
    [sending, variant],
  );

  return { submit, sending, error, sent, setSent };
}
