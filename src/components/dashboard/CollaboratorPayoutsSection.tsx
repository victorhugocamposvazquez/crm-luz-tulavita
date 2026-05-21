import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Wallet, RefreshCw, CheckCircle2 } from 'lucide-react';

type CollaboratorPayoutRow = {
  id: string;
  collaborator_id: string;
  period_from: string | null;
  period_to: string | null;
  leads_count: number;
  amount_total_eur: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  created_at: string;
  collaborators?: {
    name: string;
    code: string;
  } | null;
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

type CollaboratorPayoutsSectionProps = {
  collaboratorId?: string;
  dateFrom?: string;
  dateTo?: string;
  onCreatePayout?: () => void;
  creatingPayout?: boolean;
  embedded?: boolean;
};

export function CollaboratorPayoutsSection({
  collaboratorId,
  dateFrom,
  dateTo,
  onCreatePayout,
  creatingPayout,
  embedded = false,
}: CollaboratorPayoutsSectionProps) {
  const [payouts, setPayouts] = useState<CollaboratorPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingPayoutId, setMarkingPayoutId] = useState<string | null>(null);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('collaborator_payouts')
        .select(
          'id, collaborator_id, period_from, period_to, leads_count, amount_total_eur, status, paid_at, created_at, collaborators(name, code)',
        )
        .order('created_at', { ascending: false })
        .limit(collaboratorId ? 100 : 50);

      if (collaboratorId) {
        query = query.eq('collaborator_id', collaboratorId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setPayouts((data as CollaboratorPayoutRow[]) ?? []);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las liquidaciones',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchPayouts();
  }, [fetchPayouts]);

  const markPayoutAsPaid = async (payoutId: string) => {
    setMarkingPayoutId(payoutId);
    try {
      const { error } = await supabase
        .from('collaborator_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payoutId);
      if (error) throw error;
      toast({ title: 'Liquidación marcada como pagada' });
      await fetchPayouts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la liquidación';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setMarkingPayoutId(null);
    }
  };

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          {!collaboratorId && <TableHead>Colaborador</TableHead>}
          <TableHead>Periodo</TableHead>
          <TableHead className="text-right">Leads</TableHead>
          <TableHead className="text-right">Importe</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={collaboratorId ? 6 : 7}>Cargando liquidaciones...</TableCell>
          </TableRow>
        ) : payouts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={collaboratorId ? 6 : 7} className="text-muted-foreground">
              Aún no hay liquidaciones.
            </TableCell>
          </TableRow>
        ) : (
          payouts.map((payout) => (
            <TableRow key={payout.id}>
              <TableCell>{formatDateTime(payout.created_at)}</TableCell>
              {!collaboratorId && (
                <TableCell>
                  <div className="font-medium">{payout.collaborators?.name ?? payout.collaborator_id}</div>
                  {payout.collaborators?.code && (
                    <p className="text-xs text-muted-foreground">{payout.collaborators.code}</p>
                  )}
                </TableCell>
              )}
              <TableCell>
                {payout.period_from || payout.period_to
                  ? `${payout.period_from ?? '...'} → ${payout.period_to ?? '...'}`
                  : 'Sin filtro'}
              </TableCell>
              <TableCell className="text-right">{payout.leads_count}</TableCell>
              <TableCell className="text-right font-medium">
                {Number(payout.amount_total_eur).toFixed(2)} €
              </TableCell>
              <TableCell>
                <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'}>
                  {payout.status === 'paid' ? 'Pagada' : payout.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                </Badge>
                {payout.status === 'paid' && payout.paid_at && (
                  <p className="text-xs text-muted-foreground mt-1">{formatDateTime(payout.paid_at)}</p>
                )}
              </TableCell>
              <TableCell>
                {payout.status === 'pending' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void markPayoutAsPaid(payout.id)}
                    disabled={markingPayoutId === payout.id}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                    {markingPayoutId === payout.id ? 'Guardando...' : 'Marcar pagada'}
                  </Button>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Liquidaciones
            </CardTitle>
            <CardDescription>
              Historial de liquidaciones generadas. Cada lead convertido se liquida una sola vez.
              {(dateFrom || dateTo) && (
                <span className="block mt-1 text-xs">
                  Filtro activo: {dateFrom || '…'} → {dateTo || '…'}
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {onCreatePayout && (
              <Button variant="default" size="sm" onClick={onCreatePayout} disabled={creatingPayout}>
                <Wallet className="h-4 w-4 mr-2" />
                {creatingPayout ? 'Creando...' : 'Liquidar pendientes'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void fetchPayouts()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>{table}</CardContent>
    </Card>
  );
}
