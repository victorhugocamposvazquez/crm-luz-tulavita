import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, KeyRound, Copy, RefreshCw, Plus } from 'lucide-react';
import { buildPortalUrl, getAppBaseUrl } from '@/lib/collaborators/links';
import { createAccessToken } from '@/lib/collaborators/tokens';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type AccessTokenRow = {
  id: string;
  token: string;
  label: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
};

type CollaboratorPortalAccessCardProps = {
  collaboratorId: string;
  collaboratorName: string;
};

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}

export function CollaboratorPortalAccessCard({
  collaboratorId,
  collaboratorName,
}: CollaboratorPortalAccessCardProps) {
  const [tokens, setTokens] = useState<AccessTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const baseUrl = getAppBaseUrl();

  const fetchTokens = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collaborator_access_tokens')
        .select('id, token, label, is_active, expires_at, created_at, last_used_at')
        .eq('collaborator_id', collaboratorId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      setTokens((data as AccessTokenRow[]) ?? []);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron cargar los accesos al portal',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchTokens();
  }, [fetchTokens]);

  const activeToken = useMemo(() => {
    return tokens.find((t) => t.is_active && !isExpired(t.expires_at)) ?? null;
  }, [tokens]);

  const portalUrl = activeToken ? buildPortalUrl(baseUrl, activeToken.token) : null;

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Enlace de acceso copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const generateLink = async (expiresInDays?: number) => {
    setGenerating(true);
    try {
      const token = createAccessToken();
      const expiresAt =
        expiresInDays != null
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
      const { error } = await supabase.from('collaborator_access_tokens').insert({
        collaborator_id: collaboratorId,
        token,
        is_active: true,
        expires_at: expiresAt,
        label: expiresInDays ? `Portal ${expiresInDays}d` : 'Portal permanente',
      });
      if (error) throw error;
      const url = buildPortalUrl(baseUrl, token);
      await copyUrl(url);
      toast({
        title: expiresInDays ? 'Enlace temporal generado' : 'Enlace de acceso generado',
        description: 'Copiado al portapapeles. Envíaselo al colaborador por email o WhatsApp.',
      });
      await fetchTokens();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo generar el enlace',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Acceso al portal del colaborador
            </CardTitle>
            <CardDescription>
              Magic link para que {collaboratorName} entre en{' '}
              <span className="font-mono text-xs">/colaborador/acceso</span>. Compártelo por email o WhatsApp.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchTokens()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando enlace de acceso…</p>
        ) : portalUrl && activeToken ? (
          <>
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="default">Enlace activo</Badge>
                {activeToken.label && <Badge variant="secondary">{activeToken.label}</Badge>}
                {activeToken.expires_at && (
                  <span className="text-xs text-muted-foreground">
                    Expira: {format(new Date(activeToken.expires_at), 'd MMM yyyy HH:mm', { locale: es })}
                  </span>
                )}
              </div>
              <p className="break-all font-mono text-xs sm:text-sm">{portalUrl}</p>
              {activeToken.last_used_at && (
                <p className="text-xs text-muted-foreground">
                  Último uso: {format(new Date(activeToken.last_used_at), 'd MMM yyyy HH:mm', { locale: es })}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="default" size="sm" onClick={() => void copyUrl(portalUrl)}>
                <Copy className="h-4 w-4 mr-2" />
                Copiar enlace
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir portal
                </a>
              </Button>
              <Button variant="outline" size="sm" disabled={generating} onClick={() => void generateLink()}>
                <Plus className="h-4 w-4 mr-2" />
                Generar nuevo enlace
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Este colaborador aún no tiene un enlace de acceso activo al portal (o el anterior expiró).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={generating} onClick={() => void generateLink()}>
                <KeyRound className="h-4 w-4 mr-2" />
                {generating ? 'Generando…' : 'Generar enlace de acceso'}
              </Button>
              <Button variant="outline" disabled={generating} onClick={() => void generateLink(24)}>
                Enlace temporal 24h
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
