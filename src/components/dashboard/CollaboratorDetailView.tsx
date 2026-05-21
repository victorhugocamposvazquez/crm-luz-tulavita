import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Shield, Link2 } from 'lucide-react';
import { CollaboratorKitMenu } from './CollaboratorKitMenu';
import { CollaboratorCapturedClientsSection } from './CollaboratorCapturedClientsSection';
import { CollaboratorPaymentsSection } from './CollaboratorPaymentsSection';
import { CollaboratorTokenManager } from './CollaboratorTokenManager';
import { buildClientCaptureUrl, getAppBaseUrl } from '@/lib/collaborators/links';

export type CollaboratorRow = {
  id: string;
  code: string;
  name: string;
  commission_per_converted_eur: number;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type CollaboratorDetailViewProps = {
  collaborator: CollaboratorRow;
  onBack: () => void;
  onUpdated: () => void;
};

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CollaboratorDetailView({ collaborator, onBack, onUpdated }: CollaboratorDetailViewProps) {
  const [stats, setStats] = useState({ total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [creatingPayout, setCreatingPayout] = useState(false);
  const [paymentsRefreshKey, setPaymentsRefreshKey] = useState(0);

  const campaign = `collaborator:${collaborator.code}`;
  const clientCaptureUrl = useMemo(
    () => buildClientCaptureUrl(getAppBaseUrl(), { code: collaborator.code }),
    [collaborator.code],
  );

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('status, created_at')
        .eq('source', 'collaborator_referral')
        .eq('collaborator_id', collaborator.id);

      if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);

      const { data, error } = await query;
      if (error) throw error;

      const next = { total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
      for (const lead of data ?? []) {
        next.total += 1;
        if (lead.status === 'contacted') next.contacted += 1;
        if (lead.status === 'qualified') next.qualified += 1;
        if (lead.status === 'converted') next.converted += 1;
        if (lead.status === 'lost') next.lost += 1;
      }
      setStats(next);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'No se pudieron calcular las métricas',
        variant: 'destructive',
      });
    } finally {
      setStatsLoading(false);
    }
  }, [collaborator.id, dateFrom, dateTo]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  const toggleActive = async (next: boolean) => {
    try {
      const { error } = await supabase.from('collaborators').update({ is_active: next }).eq('id', collaborator.id);
      if (error) throw error;
      onUpdated();
      toast({ title: next ? 'Colaborador activado' : 'Colaborador desactivado' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Enlace copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const createPendingPayout = async () => {
    setCreatingPayout(true);
    try {
      let leadsQuery = supabase
        .from('leads')
        .select('id, created_at')
        .eq('collaborator_id', collaborator.id)
        .eq('status', 'converted');

      if (dateFrom) leadsQuery = leadsQuery.gte('created_at', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) leadsQuery = leadsQuery.lte('created_at', `${dateTo}T23:59:59.999Z`);

      const { data: convertedLeads, error: convertedError } = await leadsQuery;
      if (convertedError) throw convertedError;

      const convertedIds = (convertedLeads ?? []).map((lead) => lead.id);
      if (convertedIds.length === 0) {
        toast({ title: 'Sin convertidos pendientes para este rango' });
        return;
      }

      const { data: alreadyPaidRows, error: paidError } = await supabase
        .from('collaborator_payout_leads')
        .select('lead_id')
        .in('lead_id', convertedIds);
      if (paidError) throw paidError;

      const alreadyPaid = new Set((alreadyPaidRows ?? []).map((row) => row.lead_id));
      const pendingLeadIds = convertedIds.filter((id) => !alreadyPaid.has(id));

      if (pendingLeadIds.length === 0) {
        toast({ title: 'Todo liquidado', description: 'No hay convertidos pendientes de pago.' });
        return;
      }

      const amountPerLead = collaborator.commission_per_converted_eur;
      const totalAmount = Number((pendingLeadIds.length * amountPerLead).toFixed(2));
      const { data: authData } = await supabase.auth.getUser();

      const { data: payout, error: payoutError } = await supabase
        .from('collaborator_payouts')
        .insert({
          collaborator_id: collaborator.id,
          period_from: dateFrom || null,
          period_to: dateTo || null,
          leads_count: pendingLeadIds.length,
          amount_total_eur: totalAmount,
          status: 'pending',
          created_by: authData.user?.id ?? null,
        })
        .select('id')
        .single();

      if (payoutError) throw payoutError;

      const lines = pendingLeadIds.map((leadId) => ({
        payout_id: payout.id,
        collaborator_id: collaborator.id,
        lead_id: leadId,
        amount_eur: amountPerLead,
      }));

      const { error: linesError } = await supabase.from('collaborator_payout_leads').insert(lines);
      if (linesError) {
        await supabase.from('collaborator_payouts').delete().eq('id', payout.id);
        throw linesError;
      }

      toast({
        title: 'Liquidación generada',
        description: `${pendingLeadIds.length} convertidos · ${totalAmount.toFixed(2)} €. El colaborador puede subir su factura desde el portal.`,
      });
      setPaymentsRefreshKey((k) => k + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la liquidación';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setCreatingPayout(false);
    }
  };

  const conversion = stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : '0.0';
  const estimatedCommission = stats.converted * collaborator.commission_per_converted_eur;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al listado
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold">{collaborator.name}</h2>
            <Badge variant="secondary">{collaborator.code}</Badge>
            <Badge variant={collaborator.is_active ? 'default' : 'secondary'}>
              {collaborator.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Alta: {formatDateTime(collaborator.created_at)} · Campaña: {campaign}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={collaborator.is_active} onCheckedChange={(v) => void toggleActive(v)} />
          <span className="text-sm">{collaborator.is_active ? 'Activo' : 'Inactivo'}</span>
        </div>
      </div>

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="clientes">Clientes captados</TabsTrigger>
          <TabsTrigger value="pagos">Pagos y facturas</TabsTrigger>
          <TabsTrigger value="accesos">Accesos y kit</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Datos del colaborador</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p>{collaborator.email ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Teléfono</p>
                  <p>{collaborator.phone ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Comisión por convertido</p>
                  <p className="font-medium">{collaborator.commission_per_converted_eur.toFixed(2)} €</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Notas</p>
                  <p>{collaborator.notes ?? '—'}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  Enlace de captación de clientes
                </CardTitle>
                <CardDescription>URL pública para que el colaborador capture clientes (ahorro luz).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="break-all text-xs text-muted-foreground">{clientCaptureUrl}</p>
                <Button variant="outline" size="sm" onClick={() => void copyToClipboard(clientCaptureUrl)}>
                  Copiar enlace
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Métricas de clientes referidos</CardTitle>
              <CardDescription>Leads captados por este colaborador (source: collaborator_referral).</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <Label htmlFor="detail-date-from">Desde</Label>
                  <Input
                    id="detail-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="detail-date-to">Hasta</Label>
                  <Input id="detail-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="md:col-span-3 flex items-end gap-2">
                  <Button variant="outline" onClick={() => void fetchStats()} disabled={statsLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
                    Actualizar
                  </Button>
                  {(dateFrom || dateTo) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDateFrom('');
                        setDateTo('');
                      }}
                    >
                      Limpiar fechas
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Leads</p>
                  <p className="text-xl font-semibold">{stats.total}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Contactados</p>
                  <p className="text-xl font-semibold">{stats.contacted}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Calificados</p>
                  <p className="text-xl font-semibold">{stats.qualified}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Convertidos</p>
                  <p className="text-xl font-semibold">{stats.converted}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Comisión estimada</p>
                  <p className="text-xl font-semibold">{estimatedCommission.toFixed(2)} €</p>
                  <p className="text-[11px] text-muted-foreground">Conv. {conversion}%</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Kit de captación</CardTitle>
              <CardDescription>Genera enlaces firmados, QR y acceso al portal para este colaborador.</CardDescription>
            </CardHeader>
            <CardContent>
              <CollaboratorKitMenu
                collaboratorId={collaborator.id}
                code={collaborator.code}
                name={collaborator.name}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes">
          <CollaboratorCapturedClientsSection collaboratorId={collaborator.id} embedded={false} />
        </TabsContent>

        <TabsContent value="pagos">
          <CollaboratorPaymentsSection
            key={paymentsRefreshKey}
            collaboratorId={collaborator.id}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onCreatePayout={() => void createPendingPayout()}
            creatingPayout={creatingPayout}
          />
        </TabsContent>

        <TabsContent value="accesos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Tokens y enlaces
              </CardTitle>
              <CardDescription>
                Enlaces de captación y accesos al portal generados para {collaborator.name}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CollaboratorTokenManager collaboratorId={collaborator.id} embedded />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
