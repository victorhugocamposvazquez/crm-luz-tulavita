import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Loader2, QrCode, UserPlus, Wallet, Copy, Upload, Users, FileText, Trash2, Eye, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatSavingsPercent } from '@/lib/leads/invoice-utils';
import {
  ALL_ENTRY_MODES,
  ENTRY_MODE_LABELS,
  type CollaboratorEntryMode,
} from '@/lib/collaborators/types';
import { buildClientCaptureUrl, getAppBaseUrl } from '@/lib/collaborators/links';
import { downloadQrPng, generateQrDataUrl } from '@/lib/collaborators/qr';
import {
  clearPortalSession,
  getPortalSessionToken,
  setPortalSessionToken,
} from '@/lib/collaborators/portal-session';
import { ColaboradorPortalLogin } from '@/components/colaboradores/ColaboradorPortalLogin';
import { ColaboradorPortalBrandHeader } from '@/components/colaboradores/ColaboradorPortalBrandHeader';

type PortalData = {
  collaborator: {
    id: string;
    code: string;
    name: string;
    commission_per_converted_eur: number;
    email: string | null;
    phone: string | null;
  };
  stats: { leads_total: number; leads_converted: number };
  pending_payouts: Array<{
    id: string;
    amount_total_eur: number;
    leads_count: number;
    status: string;
    created_at: string;
  }>;
  referral_links: Array<{
    id: string;
    token: string;
    entry_mode: CollaboratorEntryMode;
    is_active: boolean;
    expires_at: string | null;
  }>;
  captured_clients: Array<{
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
    status: string;
    created_at: string;
    has_invoice: boolean;
    comparison_status: string | null;
    estimated_savings_percentage: number | null;
    estimated_savings_amount: number | null;
  }>;
  commission_invoices: Array<{
    id: string;
    payout_id: string | null;
    file_name: string | null;
    invoice_number: string | null;
    amount_eur: number | null;
    status: 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled';
    rejection_reason: string | null;
    submitted_at: string;
  }>;
};

const COMMISSION_INVOICE_STATUS: Record<PortalData['commission_invoices'][number]['status'], string> = {
  submitted: 'En revisión',
  approved: 'Aprobada',
  paid: 'Pagada',
  rejected: 'Rechazada',
  cancelled: 'Anulada',
};

const CLIENT_STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ColaboradorPortal() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const urlToken = searchParams.get('token')?.trim() ?? '';
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = getAppBaseUrl();

  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientMode, setClientMode] = useState<CollaboratorEntryMode>('upload');
  const [clientFile, setClientFile] = useState<File | null>(null);
  const [manualKwh, setManualKwh] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [submittingClient, setSubmittingClient] = useState(false);

  const [invoicePayoutId, setInvoicePayoutId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);

  const loadPortal = useCallback(async (token: string) => {
    if (!token) {
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/resolve-collaborator-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string } & PortalData;
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Acceso denegado');
      setData({ ...json, captured_clients: json.captured_clients ?? [], commission_invoices: json.commission_invoices ?? [] });
      if (json.pending_payouts?.[0]) setInvoicePayoutId(json.pending_payouts[0].id);
    } catch (e) {
      clearPortalSession();
      setSessionToken(null);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el portal');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (urlToken) {
      setPortalSessionToken(urlToken);
      setSessionToken(urlToken);
      navigate('/colaborador/acceso', { replace: true });
      setAuthReady(true);
      return;
    }

    const stored = getPortalSessionToken();
    setSessionToken(stored);
    setAuthReady(true);
  }, [urlToken, navigate]);

  useEffect(() => {
    if (!authReady || !sessionToken) return;
    void loadPortal(sessionToken);
  }, [authReady, sessionToken, loadPortal]);

  const handleAuthenticated = (token: string) => {
    setPortalSessionToken(token);
    setSessionToken(token);
    setError(null);
  };

  const handleLogout = () => {
    clearPortalSession();
    setSessionToken(null);
    setData(null);
    setError(null);
  };

  useEffect(() => {
    if (!data) return;
    const active = new Map<string, boolean>();
    for (const inv of data.commission_invoices ?? []) {
      if (!inv.payout_id || inv.status === 'cancelled') continue;
      if (inv.status === 'submitted' || inv.status === 'approved') {
        active.set(inv.payout_id, true);
      }
    }
    const without = (data.pending_payouts ?? []).filter((p) => !active.has(p.id));
    setInvoicePayoutId(without[0]?.id ?? '');
  }, [data]);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: 'Enlace copiado' });
  };

  const downloadQr = async (url: string, filename: string) => {
    const dataUrl = await generateQrDataUrl(url);
    downloadQrPng(dataUrl, filename);
    toast({ title: 'QR descargado' });
  };

  const getLinkForMode = (mode: CollaboratorEntryMode): string => {
    const activeLink = data?.referral_links.find((l) => l.entry_mode === mode && l.is_active);
    if (activeLink) return buildClientCaptureUrl(baseUrl, { token: activeLink.token });
    if (data?.collaborator.code) return buildClientCaptureUrl(baseUrl, { code: data.collaborator.code, entryMode: mode });
    return '';
  };

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !clientName.trim() || !clientPhone.trim()) return;
    setSubmittingClient(true);
    try {
      const body: Record<string, unknown> = {
        access_token: sessionToken,
        name: clientName.trim(),
        phone: clientPhone.trim(),
        email: clientEmail.trim() || undefined,
        entry_mode: clientMode,
      };
      if (clientFile) {
        body.attachment_base64 = await fileToBase64(clientFile);
        body.attachment_name = clientFile.name;
      }
      if (clientMode === 'manual' && manualKwh && manualTotal) {
        body.manual_extraction = {
          consumption_kwh: Number.parseFloat(manualKwh.replace(',', '.')),
          total_factura: Number.parseFloat(manualTotal.replace(',', '.')),
        };
      }
      const res = await fetch('/api/collaborator-submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Error al registrar cliente');
      toast({ title: 'Cliente registrado', description: 'El lead aparecerá en el CRM.' });
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientFile(null);
      setManualKwh('');
      setManualTotal('');
      void loadPortal(sessionToken);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo registrar',
        variant: 'destructive',
      });
    } finally {
      setSubmittingClient(false);
    }
  };

  const submitCommissionInvoice = async () => {
    if (!sessionToken || !invoicePayoutId || !invoiceFile) return;
    setSubmittingInvoice(true);
    try {
      const res = await fetch('/api/collaborator-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: sessionToken,
          payout_id: invoicePayoutId,
          invoice_number: invoiceNumber.trim() || undefined,
          file_name: invoiceFile.name,
          file_base64: await fileToBase64(invoiceFile),
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Error al subir factura');
      toast({ title: 'Factura enviada', description: 'El equipo revisará tu factura de comisión.' });
      setInvoiceFile(null);
      setInvoiceNumber('');
      setUploadConfirmOpen(false);
      void loadPortal(sessionToken);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo subir',
        variant: 'destructive',
      });
    } finally {
      setSubmittingInvoice(false);
    }
  };

  const openInvoiceFile = async (invoiceId: string) => {
    if (!sessionToken) return;
    try {
      const res = await fetch('/api/collaborator-invoice-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: sessionToken, invoice_id: invoiceId }),
      });
      const json = (await res.json()) as { success?: boolean; signed_url?: string; error?: string };
      if (!res.ok || !json.success || !json.signed_url) throw new Error(json.error ?? 'No se pudo abrir');
      window.open(json.signed_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo abrir la factura',
        variant: 'destructive',
      });
    }
  };

  const deleteCommissionInvoice = async () => {
    if (!sessionToken || !deleteInvoiceId || deleteReason.trim().length < 5) return;
    setDeletingInvoice(true);
    try {
      const res = await fetch('/api/collaborator-invoice-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: sessionToken,
          invoice_id: deleteInvoiceId,
          reason: deleteReason.trim(),
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo anular');
      toast({ title: 'Factura anulada', description: 'Puedes subir una nueva factura para esa liquidación.' });
      setDeleteInvoiceId(null);
      setDeleteReason('');
      void loadPortal(sessionToken);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo anular',
        variant: 'destructive',
      });
    } finally {
      setDeletingInvoice(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessionToken) {
    return <ColaboradorPortalLogin onAuthenticated={handleAuthenticated} initialError={error} />;
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return <ColaboradorPortalLogin onAuthenticated={handleAuthenticated} initialError={error} />;
  }

  const { collaborator, stats, pending_payouts, captured_clients, commission_invoices } = data;

  const activeInvoiceByPayout = new Map<string, (typeof commission_invoices)[number]>();
  for (const inv of commission_invoices) {
    if (!inv.payout_id || inv.status === 'cancelled') continue;
    if (['submitted', 'approved', 'paid', 'rejected'].includes(inv.status)) {
      activeInvoiceByPayout.set(inv.payout_id, inv);
    }
  }

  const payoutsWithoutActiveInvoice = pending_payouts.filter((p) => {
    const inv = activeInvoiceByPayout.get(p.id);
    return !inv || !['submitted', 'approved'].includes(inv.status);
  });

  const visibleInvoices = commission_invoices.filter((inv) => inv.status !== 'cancelled');

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <ColaboradorPortalBrandHeader subtitle="Portal colaborador" />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-background p-4">
          <div>
            <h1 className="text-xl font-bold">{collaborator.name}</h1>
            <Badge variant="secondary" className="mt-1">{collaborator.code}</Badge>
          </div>
          <Button variant="outline" size="sm" className="w-fit" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Leads captados</p>
              <p className="text-2xl font-semibold">{stats.leads_total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Convertidos</p>
              <p className="text-2xl font-semibold">{stats.leads_converted}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Comisión / convertido</p>
              <p className="text-2xl font-semibold">{collaborator.commission_per_converted_eur.toFixed(2)} €</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="links">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
            <TabsTrigger value="links">Enlaces</TabsTrigger>
            <TabsTrigger value="clientes">Mis clientes</TabsTrigger>
            <TabsTrigger value="client">Nuevo cliente</TabsTrigger>
            <TabsTrigger value="payouts">Liquidaciones</TabsTrigger>
            <TabsTrigger value="qr">QR</TabsTrigger>
          </TabsList>

          <TabsContent value="links" className="space-y-3 mt-4">
            {ALL_ENTRY_MODES.map((mode) => {
              const url = getLinkForMode(mode);
              return (
                <Card key={mode}>
                  <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <p className="font-medium">{ENTRY_MODE_LABELS[mode]}</p>
                      <p className="text-xs text-muted-foreground break-all">{url}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void copyLink(url)}>
                      <Copy className="h-3.5 w-3.5 mr-1" />
                      Copiar
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="clientes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Mis clientes captados
                </CardTitle>
                <CardDescription>
                  Estado de tus referidos y resultado del análisis de factura cuando está disponible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {captured_clients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no tienes clientes registrados.</p>
                ) : (
                  <div className="space-y-3">
                    {captured_clients.map((client) => (
                      <div key={client.id} className="rounded-lg border p-3 space-y-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{client.name ?? 'Sin nombre'}</p>
                            <p className="text-xs text-muted-foreground">
                              {[client.phone, client.email].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          <Badge variant="secondary">
                            {CLIENT_STATUS_LABELS[client.status] ?? client.status}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>
                            {format(new Date(client.created_at), 'd MMM yyyy', { locale: es })}
                          </span>
                          {client.has_invoice ? (
                            <span className="inline-flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              Factura recibida
                            </span>
                          ) : (
                            <span>Sin factura</span>
                          )}
                          {client.comparison_status === 'completed' && (
                            <span className="font-medium text-emerald-700">
                              Ahorro est.: {formatSavingsPercent(client.estimated_savings_percentage)}
                            </span>
                          )}
                          {client.comparison_status === 'failed' && (
                            <span className="text-destructive">Análisis no disponible</span>
                          )}
                          {client.comparison_status &&
                            client.comparison_status !== 'completed' &&
                            client.comparison_status !== 'failed' && (
                              <span>Análisis en proceso</span>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="client" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Registrar cliente
                </CardTitle>
                <CardDescription>
                  Para clientes que no usan tu enlace. Adjunta factura o datos manuales.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={(e) => void submitClient(e)}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nombre</Label>
                      <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                      <Label>Teléfono</Label>
                      <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Email (opcional)</Label>
                    <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Modo de entrada</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={clientMode}
                      onChange={(e) => setClientMode(e.target.value as CollaboratorEntryMode)}
                    >
                      {ALL_ENTRY_MODES.map((m) => (
                        <option key={m} value={m}>
                          {ENTRY_MODE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(clientMode === 'upload' || clientMode === 'auto') && (
                    <div className="space-y-1">
                      <Label>Factura (PDF/imagen)</Label>
                      <Input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={(e) => setClientFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  )}
                  {clientMode === 'manual' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>kWh consumo</Label>
                        <Input value={manualKwh} onChange={(e) => setManualKwh(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Importe factura (€)</Label>
                        <Input value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} />
                      </div>
                    </div>
                  )}
                  <Button type="submit" disabled={submittingClient}>
                    {submittingClient ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                    Enviar cliente
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Liquidaciones pendientes
                </CardTitle>
                <CardDescription>
                  Comisiones calculadas por Tulavita. El pago se realiza manualmente; aquí solo ves lo pendiente de cobro.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pending_payouts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes liquidaciones pendientes.</p>
                ) : (
                  <ul className="space-y-2">
                    {pending_payouts.map((p) => {
                      const linkedInvoice = activeInvoiceByPayout.get(p.id);
                      return (
                        <li key={p.id} className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium">{Number(p.amount_total_eur).toFixed(2)} €</p>
                            <p className="text-xs text-muted-foreground">
                              {p.leads_count} convertidos ·{' '}
                              {format(new Date(p.created_at), 'd MMM yyyy', { locale: es })}
                            </p>
                            {linkedInvoice && (
                              <p className="text-xs mt-1">
                                Factura: {COMMISSION_INVOICE_STATUS[linkedInvoice.status]}
                                {linkedInvoice.invoice_number ? ` · ${linkedInvoice.invoice_number}` : ''}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary">Pendiente de pago</Badge>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Mis facturas de comisión
                </CardTitle>
                <CardDescription>
                  Facturas que has enviado para cobrar tus liquidaciones. Puedes anularlas si subiste un archivo erróneo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {visibleInvoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aún no has enviado ninguna factura de comisión.</p>
                ) : (
                  <div className="space-y-3">
                    {visibleInvoices.map((inv) => {
                      const payout = pending_payouts.find((p) => p.id === inv.payout_id);
                      const canDelete = inv.status === 'submitted' || inv.status === 'rejected';
                      return (
                        <div key={inv.id} className="rounded-lg border p-3 space-y-2">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {inv.invoice_number ?? inv.file_name ?? 'Factura sin número'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(inv.submitted_at), 'd MMM yyyy HH:mm', { locale: es })}
                                {inv.amount_eur != null ? ` · ${Number(inv.amount_eur).toFixed(2)} €` : ''}
                                {payout ? ` · Liquidación ${Number(payout.amount_total_eur).toFixed(2)} €` : ''}
                              </p>
                            </div>
                            <Badge variant={inv.status === 'paid' ? 'default' : 'secondary'}>
                              {COMMISSION_INVOICE_STATUS[inv.status]}
                            </Badge>
                          </div>
                          {inv.rejection_reason && inv.status === 'rejected' && (
                            <p className="text-xs text-destructive">{inv.rejection_reason}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {inv.status !== 'cancelled' && (
                              <Button variant="outline" size="sm" onClick={() => void openInvoiceFile(inv.id)}>
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                Ver PDF
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => {
                                  setDeleteInvoiceId(inv.id);
                                  setDeleteReason('');
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Anular factura
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {payoutsWithoutActiveInvoice.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Subir factura de comisión</CardTitle>
                  <CardDescription>
                    Sube el PDF de tu factura hacia Tulavita. Tras revisarla, te pagaremos por transferencia y lo
                    registraremos en el CRM.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!invoiceFile) return;
                      setUploadConfirmOpen(true);
                    }}
                  >
                    <div className="space-y-1">
                      <Label>Liquidación</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={invoicePayoutId}
                        onChange={(e) => setInvoicePayoutId(e.target.value)}
                      >
                        {payoutsWithoutActiveInvoice.map((p) => (
                          <option key={p.id} value={p.id}>
                            {Number(p.amount_total_eur).toFixed(2)} € — {p.leads_count} leads
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Nº factura (opcional)</Label>
                      <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Archivo PDF</Label>
                      <Input
                        type="file"
                        accept=".pdf,image/*"
                        required
                        onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <Button type="submit" disabled={submittingInvoice || !invoiceFile}>
                      {submittingInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                      Enviar factura
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="qr" className="mt-4 space-y-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5" />
                  Descargar QR
                </CardTitle>
                <CardDescription>QR apuntando a tu enlace preferido (subir factura).</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => void downloadQr(getLinkForMode('upload'), `qr-${collaborator.code}-upload`)}
                >
                  QR subir factura
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void downloadQr(getLinkForMode('auto'), `qr-${collaborator.code}-auto`)}
                >
                  QR captación completa
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-muted-foreground">
          ¿Problemas con el acceso? Contacta con Tulavita.
        </p>
      </div>

      <AlertDialog open={uploadConfirmOpen} onOpenChange={setUploadConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Enviar esta factura?</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará {invoiceFile?.name ?? 'el archivo'} para la liquidación seleccionada. Comprueba que el PDF es
              correcto antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submittingInvoice}>Cancelar</AlertDialogCancel>
            <Button disabled={submittingInvoice} onClick={() => void submitCommissionInvoice()}>
              {submittingInvoice ? 'Enviando...' : 'Confirmar envío'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={deleteInvoiceId != null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteInvoiceId(null);
            setDeleteReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular factura</DialogTitle>
            <DialogDescription>
              Esta acción eliminará la factura enviada. Indica el motivo para que quede registrado. Podrás subir otra
              factura para la misma liquidación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-invoice-reason">Motivo de la anulación</Label>
            <Textarea
              id="delete-invoice-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ej. Subí el PDF incorrecto / importe erróneo..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Mínimo 5 caracteres.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteInvoiceId(null)} disabled={deletingInvoice}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={deletingInvoice || deleteReason.trim().length < 5}
              onClick={() => void deleteCommissionInvoice()}
            >
              {deletingInvoice ? 'Anulando...' : 'Confirmar anulación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
