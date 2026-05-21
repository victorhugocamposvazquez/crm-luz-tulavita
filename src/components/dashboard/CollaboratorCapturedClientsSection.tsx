import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { RefreshCw, Users, Eye, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import LeadDetailSheet from './LeadDetailSheet';
import {
  formatSavingsPercent,
  leadHasClientInvoice,
  pickLatestComparison,
  type EnergyComparisonSummary,
} from '@/lib/leads/invoice-utils';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

type CollaboratorOption = {
  id: string;
  name: string;
  code: string;
};

type CapturedClientRow = LeadRow & {
  collaborators?: { name: string; code: string } | null;
  energy_comparisons?: EnergyComparisonSummary[] | null;
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

type CollaboratorCapturedClientsSectionProps = {
  collaborators?: CollaboratorOption[];
  collaboratorId?: string;
  embedded?: boolean;
};

export function CollaboratorCapturedClientsSection({
  collaborators = [],
  collaboratorId,
  embedded = false,
}: CollaboratorCapturedClientsSectionProps) {
  const [rows, setRows] = useState<CapturedClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [collaboratorFilter, setCollaboratorFilter] = useState<string>(collaboratorId ?? 'all');
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select(
          'id, name, phone, email, status, created_at, custom_fields, collaborator_id, campaign, source, collaborators(name, code), energy_comparisons(id, status, estimated_savings_percentage, estimated_savings_amount, current_company, best_offer_company, prudent_mode, error_message, created_at)',
        )
        .eq('source', 'collaborator_referral')
        .order('created_at', { ascending: false })
        .limit(100);

      if (collaboratorFilter !== 'all') {
        query = query.eq('collaborator_id', collaboratorFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data as CapturedClientRow[]) ?? []);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron cargar los clientes captados',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [collaboratorFilter]);

  useEffect(() => {
    if (collaboratorId) {
      setCollaboratorFilter(collaboratorId);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchClients();
  }, [fetchClients]);

  const openDetail = (lead: LeadRow) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const showCollaboratorColumn = !collaboratorId;
  const colSpan = showCollaboratorColumn ? 7 : 6;

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          {showCollaboratorColumn && <TableHead>Colaborador</TableHead>}
          <TableHead>Cliente</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Factura</TableHead>
          <TableHead>Ahorro est.</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={colSpan}>Cargando...</TableCell>
          </TableRow>
        ) : rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-muted-foreground">
              Sin clientes captados todavía.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const comparison = pickLatestComparison(row.energy_comparisons ?? undefined);
            const hasInvoice = leadHasClientInvoice(row.custom_fields);
            return (
              <TableRow key={row.id} className="hover:bg-muted/50">
                {showCollaboratorColumn && (
                  <TableCell>
                    <div className="font-medium text-sm">{row.collaborators?.name ?? '—'}</div>
                    {row.collaborators?.code && (
                      <Badge variant="secondary" className="text-xs mt-0.5">
                        {row.collaborators.code}
                      </Badge>
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <div className="font-medium">{row.name ?? '—'}</div>
                  <p className="text-xs text-muted-foreground">
                    {[row.phone, row.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </TableCell>
                <TableCell>{STATUS_LABELS[row.status] ?? row.status}</TableCell>
                <TableCell>
                  {hasInvoice ? (
                    <Badge variant="outline" className="gap-1">
                      <FileText className="h-3 w-3" />
                      Sí
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">No</span>
                  )}
                </TableCell>
                <TableCell>
                  {comparison?.status === 'completed' ? (
                    <span className="font-medium text-emerald-700">
                      {formatSavingsPercent(comparison.estimated_savings_percentage)}
                    </span>
                  ) : comparison?.status === 'failed' ? (
                    <Badge variant="destructive">Error</Badge>
                  ) : comparison ? (
                    <Badge variant="secondary">En proceso</Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">
                  {format(new Date(row.created_at), 'd MMM yyyy HH:mm', { locale: es })}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openDetail(row)}>
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <>
      {embedded ? (
        table
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Clientes captados
                </CardTitle>
                <CardDescription>
                  Leads referidos con factura adjunta y resultado del comparador de ahorro cuando exista.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!collaboratorId && collaborators.length > 0 && (
                  <Select value={collaboratorFilter} onValueChange={setCollaboratorFilter}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los colaboradores</SelectItem>
                      {collaborators.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} ({c.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" size="sm" onClick={() => void fetchClients()} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Recargar
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>{table}</CardContent>
        </Card>
      )}

      <LeadDetailSheet
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onLeadUpdated={() => void fetchClients()}
      />
    </>
  );
}
