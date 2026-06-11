import { useEffect, useMemo, useState } from 'react';
import type { CollaboratorEntryMode } from '@/lib/collaborators/types';

export type { CollaboratorEntryMode };

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

/**
 * Persistencia en sessionStorage (misma idea que la atribución Meta): si el usuario
 * recarga o navega y la URL pierde el ?ref=/?colaborador=, la atribución no se pierde
 * durante la sesión.
 */
const REFERRAL_STORAGE_KEY = 'crm_luz_collaborator_referral';

function resolveInitialReferral(): { code: string | null; ref: string | null } {
  const code = readCollaboratorCodeFromUrl();
  const ref = readCollaboratorRefTokenFromUrl();
  if (code || ref) {
    try {
      sessionStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify({ code, ref }));
    } catch {
      /* sessionStorage no disponible */
    }
    return { code, ref };
  }
  try {
    const raw = sessionStorage.getItem(REFERRAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { code?: string | null; ref?: string | null };
      return { code: normalizeCode(parsed.code ?? null), ref: normalizeCode(parsed.ref ?? null) };
    }
  } catch {
    /* sessionStorage no disponible o JSON corrupto */
  }
  return { code: null, ref: null };
}

export function useCollaboratorReferral() {
  const [initialReferral] = useState(resolveInitialReferral);
  const [collaborator, setCollaborator] = useState<CollaboratorReferral | null>(null);
  const [loading, setLoading] = useState(() => !!(initialReferral.code || initialReferral.ref));
  const [requestedCode] = useState<string | null>(initialReferral.code);
  const [requestedRef] = useState<string | null>(initialReferral.ref);
  const [entryMode, setEntryMode] = useState<CollaboratorEntryMode>('auto');

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
