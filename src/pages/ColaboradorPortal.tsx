import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Loader2, QrCode, UserPlus, Wallet, Copy, Upload, Users, FileText } from 'lucide-react';
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
  const token = searchParams.get('token')?.trim() ?? '';
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
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

  const loadPortal = useCallback(async () => {
    if (!token) {
      setError('Falta el token de acceso en la URL.');
      setLoading(false);
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
      setData({ ...json, captured_clients: json.captured_clients ?? [] });
      if (json.pending_payouts?.[0]) setInvoicePayoutId(json.pending_payouts[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el portal');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadPortal();
  }, [loadPortal]);

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
    if (!token || !clientName.trim() || !clientPhone.trim()) return;
    setSubmittingClient(true);
    try {
      const body: Record<string, unknown> = {
        access_token: token,
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
      void loadPortal();
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

  const submitCommissionInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !invoicePayoutId || !invoiceFile) return;
    setSubmittingInvoice(true);
    try {
      const res = await fetch('/api/collaborator-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
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
      void loadPortal();
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Portal no disponible</CardTitle>
            <CardDescription>{error ?? 'Token inválido'}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { collaborator, stats, pending_payouts, captured_clients } = data;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Portal colaborador Tulavita</p>
          <h1 className="text-2xl font-bold">{collaborator.name}</h1>
          <Badge variant="secondary" className="mt-1">{collaborator.code}</Badge>
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
                    {pending_payouts.map((p) => (
                      <li key={p.id} className="flex justify-between items-center rounded border p-3">
                        <div>
                          <p className="font-medium">{Number(p.amount_total_eur).toFixed(2)} €</p>
                          <p className="text-xs text-muted-foreground">{p.leads_count} convertidos</p>
                        </div>
                        <Badge variant="secondary">Pendiente</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {pending_payouts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Subir factura de comisión</CardTitle>
                  <CardDescription>
                    Sube el PDF de tu factura hacia Tulavita. Tras revisarla, te pagaremos por transferencia y lo
                    registraremos en el CRM.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="space-y-4" onSubmit={(e) => void submitCommissionInvoice(e)}>
                    <div className="space-y-1">
                      <Label>Liquidación</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={invoicePayoutId}
                        onChange={(e) => setInvoicePayoutId(e.target.value)}
                      >
                        {pending_payouts.map((p) => (
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
                      {submittingInvoice ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
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
    </div>
  );
}
