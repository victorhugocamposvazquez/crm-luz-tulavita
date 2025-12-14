import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import VisitsTable from '@/components/visits/VisitsTable';
import ClientPagination from '@/components/dashboard/ClientPagination';
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import AdminVisitManagementDialog from '@/components/admin/AdminVisitManagementDialog';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import { calculateSaleCommission, calculateEffectiveAmount } from '@/lib/commission';

export default function AdminVisitsView() {
  const { userRole } = useAuth();
  const [visits, setVisits] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [commercials, setCommercials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<any | null>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);
  const [adminManagementVisit, setAdminManagementVisit] = useState<any | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    commercial: '',
    dni: '',
    startDate: '',
    endDate: '',
    status: ''
  });
  const [visitsPagination, setVisitsPagination] = useState({ currentPage: 1, pageSize: 20 });
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClientForReminder, setSelectedClientForReminder] = useState<{ id: string; name: string } | null>(null);

  // Acceso solo admin
  useEffect(() => {
    if (userRole?.role !== 'admin') {
      toast({ title: "Acceso denegado", description: "Solo administradores", variant: "destructive" });
      return;
    }
    fetchCommercials();
    fetchSales();
    fetchVisits();
  }, [userRole]);

  // Fetch comerciales
  const fetchCommercials = async () => {
    const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, email');
    if (error) return console.error(error);
    setCommercials(data || []);
  };

  // Fetch ventas
  const fetchSales = async () => {
    const { data, error } = await supabase.from('sales').select('*');
    if (error) return console.error(error);
    setSales(data || []);
  };

  // Fetch visitas con clientes y segundos comerciales siempre
  const fetchVisits = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('visits')
        .select(`
          *,
          client:clients (id, nombre_apellidos, dni),
          commercial:profiles (id, first_name, last_name, email),
          second_commercial:profiles (id, first_name, last_name, email),
          company:companies (id, name),
          visit_states (name, description)
        `)
        .order('visit_date', { ascending: false });

      // Aplicar filtros
      if (filters.commercial) query = query.eq('commercial_id', filters.commercial);
      if (filters.startDate) query = query.gte('visit_date', filters.startDate);
      if (filters.endDate) query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      if (filters.status) {
        if (filters.status === 'in_progress') query = query.eq('status', 'in_progress');
        else if (filters.status === 'approved') query = query.eq('approval_status', 'approved');
      }

      const { data, error } = await query;
      if (error) throw error;
      let enrichedVisits = data || [];

      // Filtro DNI client-side
      if (filters.dni) {
        enrichedVisits = enrichedVisits.filter(v => v.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase()));
      }

      setVisits(enrichedVisits);
    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "No se pudieron cargar las visitas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleViewVisit = (visit: any) => {
    setSelectedVisit(visit);
    setVisitSales(sales.filter(sale => sale.visit_id === visit.id));
  };

  const handleAdminManageVisit = (visit: any) => {
    setAdminManagementVisit(visit);
    setAdminDialogOpen(true);
  };

  const handleAdminDialogClose = () => {
    setAdminDialogOpen(false);
    setAdminManagementVisit(null);
  };

  const handleCreateReminder = (visit: any) => {
    setSelectedClientForReminder({ id: visit.client_id, name: visit.client?.nombre_apellidos || '' });
    setReminderDialogOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ commercial: '', dni: '', startDate: '', endDate: '', status: '' });
  };

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    return [commercial.first_name, commercial.last_name].filter(Boolean).join(' ') || commercial.email;
  };

  const paginatedVisits = visits.slice(
    (visitsPagination.currentPage - 1) * visitsPagination.pageSize,
    visitsPagination.currentPage * visitsPagination.pageSize
  );
  const totalPages = Math.ceil(visits.length / visitsPagination.pageSize);

  // Refrescar visitas cuando cambian filtros
  useEffect(() => {
    const debounce = setTimeout(fetchVisits, 300);
    return () => clearTimeout(debounce);
  }, [filters]);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2"><Search className="h-5 w-5" /><span>Filtros</span></div>
            {Object.values(filters).some(v => v) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" /></Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label>Comercial</Label>
              <Select value={filters.commercial || undefined} onValueChange={v => handleFilterChange('commercial', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {commercials.map(c => <SelectItem key={c.id} value={c.id}>{getCommercialName(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>DNI Cliente</Label>
              <Input placeholder="DNI..." value={filters.dni} onChange={e => handleFilterChange('dni', e.target.value)} />
            </div>
            <div>
              <Label>Estado</Label>
              <Select value={filters.status || undefined} onValueChange={v => handleFilterChange('status', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="approved">Confirmadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha desde</Label>
              <Input type="date" value={filters.startDate} onChange={e => handleFilterChange('startDate', e.target.value)} />
            </div>
            <div>
              <Label>Fecha hasta</Label>
              <Input type="date" value={filters.endDate} onChange={e => handleFilterChange('endDate', e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla visitas */}
      <Card>
        <CardHeader><CardTitle>Lista de visitas ({visits.length})</CardTitle></CardHeader>
        <CardContent>
          <VisitsTable
            visits={paginatedVisits}
            sales={sales}
            onViewVisit={handleViewVisit}
            onAdminManageVisit={handleAdminManageVisit}
            onCreateReminder={handleCreateReminder}
            loading={loading}
            showClientColumns={true}
            emptyMessage="No se encontraron visitas"
          />
          {visits.length > visitsPagination.pageSize && (
            <ClientPagination
              currentPage={visitsPagination.currentPage}
              totalPages={totalPages}
              pageSize={visitsPagination.pageSize}
              totalItems={visits.length}
              onPageChange={page => setVisitsPagination(prev => ({ ...prev, currentPage: page }))}
              onPageSizeChange={size => setVisitsPagination(prev => ({ ...prev, pageSize: size, currentPage: 1 }))}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <VisitDetailsDialog
        visit={selectedVisit}
        sales={visitSales}
        onClose={() => setSelectedVisit(null)}
        onAdminManageVisit={handleAdminManageVisit}
        showClientInfo={true}
      />

      <AdminVisitManagementDialog
        visit={adminManagementVisit}
        isOpen={adminDialogOpen}
        onClose={handleAdminDialogClose}
        onVisitUpdated={fetchVisits}
      />

      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        clientId={selectedClientForReminder?.id || ''}
        clientName={selectedClientForReminder?.name || ''}
        onReminderCreated={fetchVisits}
      />
    </div>
  );
}
