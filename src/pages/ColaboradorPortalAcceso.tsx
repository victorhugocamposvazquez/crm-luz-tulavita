import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ColaboradorPortalLogin } from '@/components/colaboradores/ColaboradorPortalLogin';
import { getPortalSessionToken, setPortalSessionToken } from '@/lib/collaborators/portal-session';
import { useCollaboratorPwaManifest } from '@/lib/pwa/useCollaboratorPwaManifest';

export default function ColaboradorPortalAcceso() {
  useCollaboratorPwaManifest();
  const navigate = useNavigate();
  const location = useLocation();
  const errorFromRedirect = (location.state as { error?: string } | null)?.error ?? null;

  useEffect(() => {
    const stored = getPortalSessionToken();
    if (stored) {
      navigate('/colaborador/panel', { replace: true });
    }
  }, [navigate]);

  const handleAuthenticated = (token: string) => {
    setPortalSessionToken(token);
    navigate('/colaborador/panel', { replace: true });
  };

  return <ColaboradorPortalLogin onAuthenticated={handleAuthenticated} initialError={errorFromRedirect} />;
}
