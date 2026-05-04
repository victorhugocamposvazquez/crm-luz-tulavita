import { useEffect, useMemo, useState } from 'react';

export interface CollaboratorReferral {
  id: string;
  code: string;
  name: string;
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

function readCollaboratorRefTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return normalizeCode(params.get('ref') ?? params.get('collab_ref'));
}

export type CollaboratorEntryMode = 'auto' | 'upload' | 'manual' | 'callback';

export function useCollaboratorReferral() {
  const [collaborator, setCollaborator] = useState<CollaboratorReferral | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestedCode, setRequestedCode] = useState<string | null>(() => readCollaboratorCodeFromUrl());
  const [requestedRef, setRequestedRef] = useState<string | null>(() => readCollaboratorRefTokenFromUrl());
  const [entryMode, setEntryMode] = useState<CollaboratorEntryMode>('auto');

  useEffect(() => {
    const code = readCollaboratorCodeFromUrl();
    const ref = readCollaboratorRefTokenFromUrl();
    setRequestedCode(code);
    setRequestedRef(ref);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCollaborator = async () => {
      if (!requestedCode && !requestedRef) {
        setCollaborator(null);
        setEntryMode('auto');
        return;
      }
      setLoading(true);
      try {
        const apiUrl = import.meta.env.VITE_RESOLVE_COLLABORATOR_REF_API_URL ?? '/api/resolve-collaborator-ref';
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: requestedCode, ref: requestedRef }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          collaborator?: CollaboratorReferral | null;
          entry_mode?: CollaboratorEntryMode;
        };
        if (!res.ok || data.success === false) {
          throw new Error('No se pudo resolver el colaborador');
        }
        if (!cancelled) {
          setCollaborator(data.collaborator ?? null);
          setEntryMode(data.entry_mode ?? 'auto');
        }
      } catch {
        if (!cancelled) {
          setCollaborator(null);
          setEntryMode('auto');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchCollaborator();
    return () => {
      cancelled = true;
    };
  }, [requestedCode, requestedRef]);

  return useMemo(
    () => ({
      collaborator,
      loading,
      requestedCode,
      requestedRef,
      entryMode,
      hasCollaboratorInUrl: !!requestedCode || !!requestedRef,
      isResolved: !!collaborator,
    }),
    [collaborator, loading, requestedCode, requestedRef, entryMode]
  );
}
