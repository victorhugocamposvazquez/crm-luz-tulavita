import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ColaboradorPortalLogin } from '@/components/colaboradores/ColaboradorPortalLogin';
import {
  getPortalSessionToken,
  setPortalSessionToken,
} from '@/lib/collaborators/portal-session';

export default function ColaboradorPortalAcceso() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const urlToken = searchParams.get('token')?.trim() ?? '';
  const [validatingToken, setValidatingToken] = useState(!!urlToken);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const errorFromRedirect = (location.state as { error?: string } | null)?.error ?? null;

  useEffect(() => {
    if (urlToken) return;

    const stored = getPortalSessionToken();
    if (stored) {
      navigate('/colaborador/panel', { replace: true });
    }
  }, [urlToken, navigate]);

  useEffect(() => {
    if (!urlToken) {
      setValidatingToken(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      setValidatingToken(true);
      setTokenError(null);
      try {
        const res = await fetch('/api/resolve-collaborator-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: urlToken }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !json.success) {
          throw new Error(json.error ?? 'Enlace de acceso inválido o expirado');
        }
        if (cancelled) return;
        setPortalSessionToken(urlToken);
        navigate('/colaborador/panel', { replace: true });
      } catch (e) {
        if (cancelled) return;
        setTokenError(e instanceof Error ? e.message : 'No se pudo validar el acceso');
        navigate('/colaborador/acceso', { replace: true });
      } finally {
        if (!cancelled) setValidatingToken(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [urlToken, navigate]);

  const handleAuthenticated = (token: string) => {
    setPortalSessionToken(token);
    navigate('/colaborador/panel', { replace: true });
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <ColaboradorPortalLogin
      onAuthenticated={handleAuthenticated}
      initialError={tokenError ?? errorFromRedirect}
    />
  );
}
