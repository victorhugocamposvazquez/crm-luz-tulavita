import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, LogOut } from 'lucide-react';
import { clearPortalSession, getPortalSessionToken } from '@/lib/collaborators/portal-session';
import { ColaboradorPortalBrandHeader } from '@/components/colaboradores/ColaboradorPortalBrandHeader';
import { useCollaboratorPwaManifest } from '@/lib/pwa/useCollaboratorPwaManifest';
import { PortalInicioSection } from '@/components/colaboradores/portal/PortalInicioSection';
import { PortalClientesSection } from '@/components/colaboradores/portal/PortalClientesSection';
import { PortalRegistrarClienteSection } from '@/components/colaboradores/portal/PortalRegistrarClienteSection';
import { PortalPagosSection } from '@/components/colaboradores/portal/PortalPagosSection';
import type { PortalData } from '@/components/colaboradores/portal/portal-types';

export default function ColaboradorPortalPanel() {
  const navigate = useNavigate();
  useCollaboratorPwaManifest();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('inicio');

  const loadPortal = useCallback(
    async (token: string) => {
      if (!token) {
        setData(null);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/resolve-collaborator-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string } & PortalData;
        if (!res.ok || !json.success) throw new Error(json.error ?? 'Acceso denegado');
        setData({
          ...json,
          captured_clients: json.captured_clients ?? [],
          commission_invoices: json.commission_invoices ?? [],
        });
      } catch (e) {
        clearPortalSession();
        setSessionToken(null);
        const message = e instanceof Error ? e.message : 'No se pudo cargar el portal';
        navigate('/colaborador/acceso', { replace: true, state: { error: message } });
      } finally {
        setLoading(false);
      }
    },
    [navigate],
  );

  useEffect(() => {
    const stored = getPortalSessionToken();
    if (!stored) {
      navigate('/colaborador/acceso', { replace: true });
      return;
    }
    setSessionToken(stored);
    setAuthReady(true);
  }, [navigate]);

  useEffect(() => {
    if (!authReady || !sessionToken) return;
    void loadPortal(sessionToken);
  }, [authReady, sessionToken, loadPortal]);

  const handleLogout = () => {
    clearPortalSession();
    setSessionToken(null);
    setData(null);
    navigate('/colaborador/acceso', { replace: true });
  };

  const refresh = () => {
    if (sessionToken) void loadPortal(sessionToken);
  };

  if (!authReady || !sessionToken || !data || (loading && !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { collaborator, stats, pending_payouts, captured_clients, commission_invoices } = data;

  // Liquidaciones pendientes que aún no tienen factura activa (para el aviso de Inicio).
  const payoutsWithActiveInvoice = new Set(
    commission_invoices
      .filter((inv) => inv.payout_id && ['submitted', 'approved'].includes(inv.status))
      .map((inv) => inv.payout_id as string),
  );
  const pendingInvoiceCount = pending_payouts.filter((p) => !payoutsWithActiveInvoice.has(p.id)).length;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <ColaboradorPortalBrandHeader subtitle="Portal colaborador" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-background p-4">
          <div>
            <h1 className="text-xl font-bold">{collaborator.name}</h1>
            <Badge variant="secondary" className="mt-1">
              {collaborator.code}
            </Badge>
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Clientes aportados</p>
              <p className="text-2xl font-semibold">{stats.leads_total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Ventas cerradas</p>
              <p className="text-2xl font-semibold">{stats.leads_commissionable ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Comisión / venta</p>
              <p className="text-2xl font-semibold">{collaborator.commission_per_converted_eur.toFixed(2)} €</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="inicio">Inicio</TabsTrigger>
            <TabsTrigger value="client">Registrar</TabsTrigger>
            <TabsTrigger value="clientes">Mis clientes</TabsTrigger>
            <TabsTrigger value="payouts">Mis pagos</TabsTrigger>
          </TabsList>

          <TabsContent value="inicio" className="mt-4">
            <PortalInicioSection data={data} pendingInvoiceCount={pendingInvoiceCount} onGoTo={setActiveTab} />
          </TabsContent>

          <TabsContent value="client" className="mt-4">
            <PortalRegistrarClienteSection sessionToken={sessionToken} onSubmitted={refresh} />
          </TabsContent>

          <TabsContent value="clientes" className="mt-4">
            <PortalClientesSection clients={captured_clients} />
          </TabsContent>

          <TabsContent value="payouts" className="mt-4">
            <PortalPagosSection
              sessionToken={sessionToken}
              pendingPayouts={pending_payouts}
              commissionInvoices={commission_invoices}
              onChanged={refresh}
            />
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground">¿Problemas con el acceso? Contacta con Tulavita.</p>
      </div>
    </div>
  );
}
