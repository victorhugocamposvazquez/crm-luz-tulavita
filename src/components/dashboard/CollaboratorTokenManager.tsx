import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Shield, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ENTRY_MODE_LABELS, type CollaboratorEntryMode } from '@/lib/collaborators/types';

type ReferralLinkRow = {
  id: string;
  token: string;
  entry_mode: CollaboratorEntryMode;
  is_active: boolean;
  expires_at: string | null;
  label: string | null;
  created_at: string;
  collaborators?: { name: string; code: string } | null;
};

type AccessTokenRow = {
  id: string;
  token: string;
  is_active: boolean;
  expires_at: string | null;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  collaborators?: { name: string; code: string } | null;
};

function formatDt(value: string | null): string {
  if (!value) return '—';
  return format(new Date(value), 'd MMM yyyy HH:mm', { locale: es });
}

export function CollaboratorTokenManager({ collaboratorId, embedded = false }: { collaboratorId?: string; embedded?: boolean }) {
  const [referralLinks, setReferralLinks] = useState<ReferralLinkRow[]>([]);
  const [accessTokens, setAccessTokens] = useState<AccessTokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expiryDays, setExpiryDays] = useState('90');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      let refQuery = supabase
        .from('collaborator_referral_links')
        .select('id, token, entry_mode, is_active, expires_at, label, created_at, collaborators(name, code)')
        .order('created_at', { ascending: false })
        .limit(collaboratorId ? 100 : 40);

      let accessQuery = supabase
        .from('collaborator_access_tokens')
        .select('id, token, is_active, expires_at, label, created_at, last_used_at, collaborators(name, code)')
        .order('created_at', { ascending: false })
        .limit(collaboratorId ? 100 : 40);

      if (collaboratorId) {
        refQuery = refQuery.eq('collaborator_id', collaboratorId);
        accessQuery = accessQuery.eq('collaborator_id', collaboratorId);
      }

      const [refRes, accessRes] = await Promise.all([refQuery, accessQuery]);
      if (refRes.error) throw refRes.error;
      if (accessRes.error) throw accessRes.error;
      setReferralLinks((refRes.data as ReferralLinkRow[]) ?? []);
      setAccessTokens((accessRes.data as AccessTokenRow[]) ?? []);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron cargar tokens',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const toggleReferralActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('collaborator_referral_links').update({ is_active: next }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setReferralLinks((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
  };

  const toggleAccessActive = async (id: string, next: boolean) => {
    const { error } = await supabase.from('collaborator_access_tokens').update({ is_active: next }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setAccessTokens((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
  };

  const setReferralExpiry = async (id: string) => {
    const days = Number.parseInt(expiryDays, 10);
    if (!Number.isFinite(days) || days < 1) {
      toast({ title: 'Días inválidos', variant: 'destructive' });
      return;
    }
    const expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('collaborator_referral_links').update({ expires_at }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    setReferralLinks((prev) => prev.map((r) => (r.id === id ? { ...r, expires_at } : r)));
    toast({ title: 'Expiración actualizada' });
  };

  const showCollaboratorColumn = !collaboratorId;

  const content = (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Link2Icon />
          Enlaces de captación (referral)
        </h4>
        <Table>
          <TableHeader>
            <TableRow>
              {showCollaboratorColumn && <TableHead>Colaborador</TableHead>}
              <TableHead>Modo</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {referralLinks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCollaboratorColumn ? 6 : 5} className="text-muted-foreground">
                  {loading ? 'Cargando...' : 'Sin enlaces generados'}
                </TableCell>
              </TableRow>
            ) : (
              referralLinks.map((row) => (
                <TableRow key={row.id}>
                  {showCollaboratorColumn && (
                    <TableCell>
                      <div className="font-medium">{row.collaborators?.name ?? '—'}</div>
                      <Badge variant="secondary" className="text-xs">
                        {row.collaborators?.code}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell>{ENTRY_MODE_LABELS[row.entry_mode] ?? row.entry_mode}</TableCell>
                  <TableCell className="text-xs">{formatDt(row.created_at)}</TableCell>
                  <TableCell className="text-xs">{formatDt(row.expires_at)}</TableCell>
                  <TableCell>
                    <Switch checked={row.is_active} onCheckedChange={(v) => void toggleReferralActive(row.id, v)} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => void setReferralExpiry(row.id)}>
                      Fijar expiración
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Sesiones del portal (se crean al entrar con email)
        </h4>
        <Table>
          <TableHeader>
            <TableRow>
              {showCollaboratorColumn && <TableHead>Colaborador</TableHead>}
              <TableHead>Etiqueta</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead>Último uso</TableHead>
              <TableHead>Expira</TableHead>
              <TableHead>Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accessTokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showCollaboratorColumn ? 6 : 5} className="text-muted-foreground">
                  {loading ? 'Cargando...' : 'Sin tokens de portal'}
                </TableCell>
              </TableRow>
            ) : (
              accessTokens.map((row) => (
                <TableRow key={row.id}>
                  {showCollaboratorColumn && (
                    <TableCell>
                      <div className="font-medium">{row.collaborators?.name ?? '—'}</div>
                      <Badge variant="secondary" className="text-xs">
                        {row.collaborators?.code}
                      </Badge>
                    </TableCell>
                  )}
                  <TableCell className="text-xs">{row.label ?? '—'}</TableCell>
                  <TableCell className="text-xs">{formatDt(row.created_at)}</TableCell>
                  <TableCell className="text-xs">{formatDt(row.last_used_at)}</TableCell>
                  <TableCell className="text-xs">{formatDt(row.expires_at)}</TableCell>
                  <TableCell>
                    <Switch checked={row.is_active} onCheckedChange={(v) => void toggleAccessActive(row.id, v)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Gestión de tokens
            </CardTitle>
            <CardDescription>Revocar enlaces de captación y sesiones del portal. Establecer expiración.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchAll()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
        </div>
        <div className="flex items-end gap-2 pt-2">
          <div className="space-y-1">
            <Label htmlFor="token-expiry-days">Días de expiración (referral)</Label>
            <Input
              id="token-expiry-days"
              type="number"
              min={1}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-28"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

function Link2Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
