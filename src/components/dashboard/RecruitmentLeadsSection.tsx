import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'converted', 'lost'] as const;
const ALL = '__all__';

/** Canal de origen del lead a partir de la atribución guardada. */
function leadChannel(lead: LeadRow): string {
  const cf = (lead.custom_fields ?? {}) as Record<string, unknown>;
  const utmSource = typeof cf.utm_source === 'string' ? cf.utm_source : null;
  if (utmSource) return utmSource;
  if (lead.source === 'meta_ads_web') return 'meta';
  return lead.source || '—';
}

type RecruitmentLeadsSectionProps = {
  onConvertLead?: (lead: LeadRow) => void;
  embedded?: boolean;
};

export function RecruitmentLeadsSection({ onConvertLead, embedded = false }: RecruitmentLeadsSectionProps) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [channelFilter, setChannelFilter] = useState<string>(ALL);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('source', 'web_form')
        .in('campaign', [...RECRUITMENT_CAMPAIGNS])
        .order('created_at', { ascending: false })
        .limit(200);
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

  const channels = useMemo(() => {
    return [...new Set(leads.map(leadChannel))].sort((a, b) => a.localeCompare(b, 'es'));
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter !== ALL && l.status !== statusFilter) return false;
      if (channelFilter !== ALL && leadChannel(l) !== channelFilter) return false;
      return true;
    });
  }, [leads, statusFilter, channelFilter]);

  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-8 w-40 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los estados</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={channelFilter} onValueChange={setChannelFilter}>
        <SelectTrigger className="h-8 w-44 text-sm">
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos los canales</SelectItem>
          {channels.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {filteredLeads.length} de {leads.length}
      </span>
    </div>
  );

  const table = (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Nombre</TableHead>
          <TableHead>Contacto</TableHead>
          <TableHead>Campaña</TableHead>
          <TableHead>Canal</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Acción</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={7}>Cargando...</TableCell>
          </TableRow>
        ) : filteredLeads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-muted-foreground">
              {leads.length === 0
                ? 'Sin leads de reclutamiento recientes.'
                : 'Sin resultados para los filtros seleccionados.'}
            </TableCell>
          </TableRow>
        ) : (
          filteredLeads.map((lead) => (
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
              <TableCell className="text-xs">{leadChannel(lead)}</TableCell>
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
  );

  return (
    <>
      {embedded ? (
        <div className="space-y-3">
          {filters}
          {table}
        </div>
      ) : (
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
          <CardContent className="space-y-3">
            {filters}
            {table}
          </CardContent>
        </Card>
      )}

      <LeadDetailSheet
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onLeadUpdated={() => void fetchLeads()}
      />
    </>
  );
}
