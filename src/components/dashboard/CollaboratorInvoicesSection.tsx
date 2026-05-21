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
  status: 'submitted' | 'approved' | 'paid' | 'rejected';
  rejection_reason: string | null;
  submitted_at: string;
  collaborators?: { name: string; code: string } | null;
};

const STATUS_LABELS: Record<InvoiceRow['status'], string> = {
  submitted: 'Recibida',
  approved: 'Aprobada',
  paid: 'Pagada',
  rejected: 'Rechazada',
};

export function CollaboratorInvoicesSection() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collaborator_invoices')
        .select(
          'id, collaborator_id, payout_id, file_path, file_name, invoice_number, amount_eur, status, rejection_reason, submitted_at, collaborators(name, code)',
        )
        .order('submitted_at', { ascending: false })
        .limit(50);
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
  }, []);

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

      toast({ title: `Factura marcada como ${STATUS_LABELS[status].toLowerCase()}` });
      void fetchInvoices();
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Facturas de comisión
            </CardTitle>
            <CardDescription>Facturas enviadas por colaboradores desde el portal.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchInvoices()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Colaborador</TableHead>
              <TableHead>Nº factura</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {loading ? 'Cargando...' : 'Sin facturas de comisión'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs">
                    {format(new Date(row.submitted_at), 'd MMM yyyy HH:mm', { locale: es })}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{row.collaborators?.name ?? row.collaborator_id}</div>
                    {row.collaborators?.code && (
                      <p className="text-xs text-muted-foreground">{row.collaborators.code}</p>
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
                          Marcar pagada
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
