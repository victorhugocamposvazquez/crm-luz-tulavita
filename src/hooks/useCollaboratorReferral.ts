import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CollaboratorReferral {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

function normalizeCode(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;
  return cleaned;
}

function readCollaboratorCodeFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return normalizeCode(
    params.get('collaborator') ??
      params.get('colaborador') ??
      params.get('collaborator_id') ??
      params.get('colab')
  );
}

export function useCollaboratorReferral() {
  const [collaborator, setCollaborator] = useState<CollaboratorReferral | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestedCode, setRequestedCode] = useState<string | null>(() => readCollaboratorCodeFromUrl());

  useEffect(() => {
    const code = readCollaboratorCodeFromUrl();
    setRequestedCode(code);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCollaborator = async () => {
      if (!requestedCode) {
        setCollaborator(null);
        return;
      }
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('collaborators')
          .select('id, code, name, is_active')
          .eq('code', requestedCode)
          .eq('is_active', true)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setCollaborator((data as CollaboratorReferral | null) ?? null);
      } catch {
        if (!cancelled) setCollaborator(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchCollaborator();
    return () => {
      cancelled = true;
    };
  }, [requestedCode]);

  return useMemo(
    () => ({
      collaborator,
      loading,
      requestedCode,
      hasCollaboratorInUrl: !!requestedCode,
      isResolved: !!collaborator,
    }),
    [collaborator, loading, requestedCode]
  );
}
