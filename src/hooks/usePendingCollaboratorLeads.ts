import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RECRUITMENT_CAMPAIGNS } from '@/components/colaboradores/colaboradores-config';

export type PendingCollaboratorLeadCounts = {
  /** Candidatos a colaborador nuevos (funnel de reclutamiento). */
  recruitment: number;
  /** Clientes captados nuevos por un colaborador (funnel de captación). */
  captured: number;
  /** Suma de ambos: lo que se muestra en el menú lateral. */
  total: number;
};

const EMPTY: PendingCollaboratorLeadCounts = { recruitment: 0, captured: 0, total: 0 };

/**
 * Cuenta leads "para revisar" (status = 'new') de los dos funnels de colaboradores.
 * El badge se vacía solo a medida que el responsable los atiende (cambian de estado).
 *
 * @param enabled normalmente solo para admins; evita queries innecesarias.
 */
export function usePendingCollaboratorLeads(enabled = true): PendingCollaboratorLeadCounts & {
  loading: boolean;
  refetch: () => Promise<void>;
} {
  const [counts, setCounts] = useState<PendingCollaboratorLeadCounts>(EMPTY);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setCounts(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const [recruitmentRes, capturedRes] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'web_form')
          .in('campaign', [...RECRUITMENT_CAMPAIGNS])
          .eq('status', 'new'),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('source', 'collaborator_referral')
          .eq('status', 'new'),
      ]);

      const recruitment = recruitmentRes.count ?? 0;
      const captured = capturedRes.count ?? 0;
      setCounts({ recruitment, captured, total: recruitment + captured });
    } catch {
      // Silencioso: un fallo de conteo no debe romper el menú.
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Mantener el contador fresco: realtime sobre leads + refresco al volver a la pestaña.
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel('pending-collaborator-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        void refetch();
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refetch]);

  return { ...counts, loading, refetch };
}
