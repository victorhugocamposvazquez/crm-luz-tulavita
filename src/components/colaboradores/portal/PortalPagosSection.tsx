import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Loader2, Wallet, Upload, FileText, Trash2, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  COMMISSION_INVOICE_STATUS,
  fileToBase64,
  type PortalCommissionInvoice,
  type PortalPayout,
} from './portal-types';

type PortalPagosSectionProps = {
  sessionToken: string;
  pendingPayouts: PortalPayout[];
  commissionInvoices: PortalCommissionInvoice[];
  onChanged: () => void;
};

export function PortalPagosSection({
  sessionToken,
  pendingPayouts,
  commissionInvoices,
  onChanged,
}: PortalPagosSectionProps) {
  const [invoicePayoutId, setInvoicePayoutId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingInvoice, setDeletingInvoice] = useState(false);
  const [uploadConfirmOpen, setUploadConfirmOpen] = useState(false);

  const activeInvoiceByPayout = new Map<string, PortalCommissionInvoice>();
  for (const inv of commissionInvoices) {
    if (!inv.payout_id || inv.status === 'cancelled') continue;
    if (['submitted', 'approved', 'paid', 'rejected'].includes(inv.status)) {
      activeInvoiceByPayout.set(inv.payout_id, inv);
    }
  }

  const payoutsWithoutActiveInvoice = pendingPayouts.filter((p) => {
    const inv = activeInvoiceByPayout.get(p.id);
    return !inv || !['submitted', 'approved'].includes(inv.status);
  });

  const visibleInvoices = commissionInvoices.filter((inv) => inv.status !== 'cancelled');

  useEffect(() => {
    setInvoicePayoutId((current) => {
      if (current && payoutsWithoutActiveInvoice.some((p) => p.id === current)) return current;
      return payoutsWithoutActiveInvoice[0]?.id ?? '';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPayouts, commissionInvoices]);

  const submitCommissionInvoice = async () => {
    if (!invoicePayoutId || !invoiceFile) return;
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
      onChanged();
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
    try {
      const res = await fetch('/api/collaborator-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'file', access_token: sessionToken, invoice_id: invoiceId }),
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
    if (!deleteInvoiceId || deleteReason.trim().length < 5) return;
    setDeletingInvoice(true);
    try {
      const res = await fetch('/api/collaborator-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
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
      onChanged();
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

  return (
    <div className="space-y-4">
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
          {pendingPayouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tienes liquidaciones pendientes.</p>
          ) : (
            <ul className="space-y-2">
              {pendingPayouts.map((p) => {
                const linkedInvoice = activeInvoiceByPayout.get(p.id);
                return (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">{Number(p.amount_total_eur).toFixed(2)} €</p>
                      <p className="text-xs text-muted-foreground">
                        {p.leads_count} ventas cerradas · {format(new Date(p.created_at), 'd MMM yyyy', { locale: es })}
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
                const payout = pendingPayouts.find((p) => p.id === inv.payout_id);
                const canDelete = inv.status === 'submitted' || inv.status === 'rejected';
                return (
                  <div key={inv.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{inv.invoice_number ?? inv.file_name ?? 'Factura sin número'}</p>
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
                      <Button variant="outline" size="sm" onClick={() => void openInvoiceFile(inv.id)}>
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Ver PDF
                      </Button>
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
                {submittingInvoice ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Enviar factura
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

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
