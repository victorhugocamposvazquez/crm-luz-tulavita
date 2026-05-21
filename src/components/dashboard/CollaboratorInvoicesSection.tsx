import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { FileText, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type InvoiceRow = {
  id: string;
  collaborator_id: string;
  payout_id: string | null;
  file_path: string;
  file_name: string | null;
  invoice_number: string | null;
  amount_eur: number | null;
  status: 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  rejection_reason: string | null;
  submitted_at: string;
  collaborators?: { name: string; code: string } | null;
  collaborator_payouts?: {
    amount_total_eur: number;
    status: string;
    leads_count: number;
  } | null;
};

const PAYOUT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagada',
  cancelled: 'Cancelada',
};

const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  submitted: 'Recibida',
  approved: 'Aprobada',
  paid: 'Pagada',
  rejected: 'Rechazada',
  cancelled: 'Anulada',
};

export function CollaboratorInvoicesSection({
  collaboratorId,
  embedded = false,
  onPaymentRegistered,
}: {
  collaboratorId?: string;
  embedded?: boolean;
  onPaymentRegistered?: () => void;
}) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('collaborator_invoices')
        .select(
          'id, collaborator_id, payout_id, file_path, file_name, invoice_number, amount_eur, status, rejection_reason, submitted_at, collaborators(name, code), collaborator_payouts(amount_total_eur, status, leads_count)',
        )
        .order('submitted_at', { ascending: false })
        .limit(collaboratorId ? 100 : 50);

      if (collaboratorId) {
        query = query.eq('collaborator_id', collaboratorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data as InvoiceRow[]) ?? []);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron cargar facturas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  const updateStatus = async (id: string, status: InvoiceRow['status'], payoutId?: string | null) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('collaborator_invoices')
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      if (status === 'paid' && payoutId) {
        await supabase
          .from('collaborator_payouts')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', payoutId);
      }

      toast({
        title: status === 'paid' ? 'Pago registrado en el CRM' : `Factura ${STATUS_LABELS[status].toLowerCase()}`,
        description:
          status === 'paid'
            ? 'Tras el abono manual fuera del CRM, la liquidación vinculada queda marcada como pagada.'
            : undefined,
      });
      void fetchInvoices();
      if (status === 'paid') onPaymentRegistered?.();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo actualizar',
        variant: 'destructive',
      });
    } finally {
      setUpdatingId(null);
    }
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage.from('collaborator-documents').createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      toast({ title: 'No se pudo abrir el archivo', variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const showCollaboratorColumn = !collaboratorId;
  const colSpan = showCollaboratorColumn ? 7 : 6;

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {showCollaboratorColumn && <TableHead>Colaborador</TableHead>}
          <TableHead>Liquidación</TableHead>
          <TableHead>Nº factura</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-muted-foreground">
              {loading ? 'Cargando...' : 'Sin facturas recibidas del colaborador'}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="text-xs">
                {format(new Date(row.submitted_at), 'd MMM yyyy HH:mm', { locale: es })}
              </TableCell>
              {showCollaboratorColumn && (
                <TableCell>
                  <div className="font-medium">{row.collaborators?.name ?? row.collaborator_id}</div>
                  {row.collaborators?.code && (
                    <p className="text-xs text-muted-foreground">{row.collaborators.code}</p>
                  )}
                </TableCell>
              )}
              <TableCell className="text-xs">
                {row.collaborator_payouts ? (
                  <>
                    <p className="font-medium">{Number(row.collaborator_payouts.amount_total_eur).toFixed(2)} €</p>
                    <p className="text-muted-foreground">
                      {row.collaborator_payouts.leads_count} conv. ·{' '}
                      {PAYOUT_STATUS_LABELS[row.collaborator_payouts.status] ?? row.collaborator_payouts.status}
                    </p>
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell>{row.invoice_number ?? '—'}</TableCell>
              <TableCell className="text-right">
                {row.amount_eur != null ? `${Number(row.amount_eur).toFixed(2)} €` : '—'}
              </TableCell>
              <TableCell>
                <Badge variant={row.status === 'paid' ? 'default' : 'secondary'}>
                  {STATUS_LABELS[row.status]}
                </Badge>
                {row.rejection_reason && (row.status === 'rejected' || row.status === 'cancelled') && (
                  <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">{row.rejection_reason}</p>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void openFile(row.file_path)}>
                    Ver PDF
                  </Button>
                  {row.status === 'submitted' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updatingId === row.id}
                        onClick={() => void updateStatus(row.id, 'approved')}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Aprobar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updatingId === row.id}
                        onClick={() => void updateStatus(row.id, 'rejected')}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        Rechazar
                      </Button>
                    </>
                  )}
                  {(row.status === 'submitted' || row.status === 'approved') && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updatingId === row.id}
                      onClick={() => void updateStatus(row.id, 'paid', row.payout_id)}
                    >
                      Registrar pago manual
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (embedded) {
    return table;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Facturas del colaborador
            </CardTitle>
            <CardDescription>
              PDFs de comisión enviados desde el portal, vinculados a una liquidación. Aprueba la factura y, cuando hayas
              pagado fuera del CRM, registra el pago aquí.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchInvoices()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent>{table}</CardContent>
    </Card>
  );
}
