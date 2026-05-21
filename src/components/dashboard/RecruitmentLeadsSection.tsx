import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { UserPlus, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import LeadDetailSheet from './LeadDetailSheet';
import { RECRUITMENT_CAMPAIGNS } from '@/components/colaboradores/colaboradores-config';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

type RecruitmentLeadsSectionProps = {
  onConvertLead?: (lead: LeadRow) => void;
};

export function RecruitmentLeadsSection({ onConvertLead }: RecruitmentLeadsSectionProps) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('source', 'web_form')
        .in('campaign', [...RECRUITMENT_CAMPAIGNS])
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      setLeads(data ?? []);
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudieron cargar leads de reclutamiento',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Leads de reclutamiento</CardTitle>
              <CardDescription>
                Prospectos desde /hazte-colaborador (campaña hazte_colaborador).
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void fetchLeads()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Campaña</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6}>Cargando...</TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Sin leads de reclutamiento recientes.
                  </TableCell>
                </TableRow>
              ) : (
                leads.map((lead) => (
                  <TableRow
                    key={lead.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedLead(lead);
                      setDetailOpen(true);
                    }}
                  >
                    <TableCell className="font-medium">{lead.name ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {[lead.phone, lead.email].filter(Boolean).join(' · ') || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{lead.campaign ?? '—'}</Badge>
                    </TableCell>
                    <TableCell>{STATUS_LABELS[lead.status] ?? lead.status}</TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(lead.created_at), 'd MMM yyyy HH:mm', { locale: es })}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {onConvertLead && (
                        <Button variant="outline" size="sm" onClick={() => onConvertLead(lead)}>
                          <UserPlus className="h-3.5 w-3.5 mr-1" />
                          Convertir
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <LeadDetailSheet
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onLeadUpdated={() => void fetchLeads()}
      />
    </>
  );
}
