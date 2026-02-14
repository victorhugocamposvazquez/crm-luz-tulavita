import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Search, RefreshCw, ExternalLink, Loader2, Plus, Eye } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import LeadDetailSheet from './LeadDetailSheet';
import NewLeadDialog from './NewLeadDialog';

type LeadRow = Database['public']['Tables']['leads']['Row'];

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

const SOURCE_LABELS: Record<string, string> = {
  web_form: 'Formulario web',
  meta_lead_ads: 'Meta Lead Ads',
  meta_ads_web: 'Meta Ads Web',
  csv_import: 'Importación CSV',
  manual: 'Manual',
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LeadsManagement() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newLeadOpen, setNewLeadOpen] = useState(false);

  const fetchLeads = useCallback(
    async (selectedId?: string) => {
      setLoading(true);
      try {
        let query = supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }
        if (sourceFilter !== 'all') {
          query = query.eq('source', sourceFilter);
        }
        if (dateFrom) {
          query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
        }
        if (dateTo) {
          query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);
        }

        const { data, error } = await query;

        if (error) throw error;
        const list = data ?? [];
        setLeads(list);
        if (selectedId) {
          const updated = list.find((l) => l.id === selectedId);
          if (updated) setSelectedLead(updated);
        }
      } catch (error) {
        console.error('Error fetching leads:', error);
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los leads',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, sourceFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const filteredLeads = leads.filter((lead) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (lead.name?.toLowerCase().includes(q)) ||
      (lead.email?.toLowerCase().includes(q)) ||
      (lead.phone?.includes(search))
    );
  });

  const openDetail = (lead: LeadRow) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleLeadUpdated = () => {
    fetchLeads(selectedLead?.id ?? undefined);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Leads</CardTitle>
              <CardDescription>
                Gestión de leads del formulario y otras fuentes
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setNewLeadOpen(true)} size="sm">
                <Plus className="h-4 w-4" />
                Nuevo lead
              </Button>
              <a
                href="/ahorra-factura-luz"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                Ver formulario
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o teléfono..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Fuente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las fuentes</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full sm:w-[140px]"
                title="Desde"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full sm:w-[140px]"
                title="Hasta"
              />
              <button
                onClick={() => fetchLeads()}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border bg-background hover:bg-accent disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="rounded-md border overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                No hay leads que coincidan con los filtros
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Fuente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDetail(lead)}
                    >
                      <TableCell className="w-10">
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.name || '—'}
                      </TableCell>
                      <TableCell>{lead.phone || '—'}</TableCell>
                      <TableCell>{lead.email || '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {SOURCE_LABELS[lead.source] ?? lead.source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            lead.status === 'new'
                              ? 'default'
                              : lead.status === 'converted'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {STATUS_LABELS[lead.status] ?? lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(lead.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <LeadDetailSheet
        lead={selectedLead}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onLeadUpdated={handleLeadUpdated}
      />

      <NewLeadDialog
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        onSuccess={handleLeadUpdated}
      />
    </div>
  );
}
