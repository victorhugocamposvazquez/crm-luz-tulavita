import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import VisitsTable from '@/components/visits/VisitsTable';
import { calculateCommission, calculateTotalExcludingNulls, calculateSaleCommission } from '@/lib/commission';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ClientPagination from '@/components/dashboard/ClientPagination';
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import AdminVisitManagementDialog from '@/components/admin/AdminVisitManagementDialog';
import ReminderDialog from '@/components/reminders/ReminderDialog';

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  approval_status: 'pending' | 'approved' | 'rejected' | 'waiting_admin';
  notes?: string;
  permission: string;
  commercial_id: string;
  second_commercial_id?: string;
  client_id: string;
  company_id?: string;
  visit_states?: {
    name: string;
    description: string;
  };
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  second_commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
  client?: {
    id: string;
    nombre_apellidos: string;
    dni?: string;
    direccion?: string;  
  };
  company?: {
    name: string;
  };
}

interface Commercial {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  commission_percentage: number;
  commission_amount: number;
  visit_id: string;
  sale_lines?: {
    products: { product_name: string }[];
    quantity: number;
    unit_price: number;
    financiada: boolean;
    transferencia: boolean;
    nulo: boolean;
  }[];
}

// Estados y etiquetas igual que en ClientDetailView
const statusLabels = {
  in_progress: 'En progreso',
  confirmado: 'Confirmada',
  ausente: 'Ausente',
  nulo: 'Sin resultado',
  oficina: 'Oficina'
};

const statusColors = {
  in_progress: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  confirmado: 'bg-green-100 text-green-800 hover:bg-green-100',
  ausente: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  nulo: 'bg-red-100 text-red-800 hover:bg-red-100',
  oficina: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
};

export default function AdminVisitsView() {
  const { userRole } = useAuth();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitSales, setVisitSales] = useState<Sale[]>([]);
  const [adminManagementVisit, setAdminManagementVisit] = useState<Visit | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    commercial: '',
    dni: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    status: ''
  });

  // Pagination state for visits view
  const [visitsPagination, setVisitsPagination] = useState({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0
  });

  // Reminder dialog state
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClientForReminder, setSelectedClientForReminder] = useState<{ id: string; name: string } | null>(null);

  // Redirect if not admin
  useEffect(() => {
    if (userRole?.role !== 'admin') {
      toast({
        title: "Acceso denegado",
        description: "Solo los administradores pueden acceder a esta vista",
        variant: "destructive"
      });
      return;
    }
  }, [userRole]);

  useEffect(() => {
    if (userRole?.role === 'admin') {
      fetchCommercials();
      fetchVisits();
      fetchSales();
    }
  }, [userRole]);

  const fetchCommercials = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', 
          (await supabase
            .from('user_roles')
            .select('user_id')
            .eq('role', 'commercial')).data?.map(r => r.user_id) || []
        );

      if (error) throw error;
      setCommercials(data || []);
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const { data: salesData, error } = await supabase
        .from('sales')
        .select('id, amount, sale_date, commission_percentage, commission_amount, visit_id');

      if (error) throw error;

      setSales(salesData || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('visits')
        .select(`
          *,
          visit_states(name, description)
        `)
        .order('visit_date', { ascending: false });

      // Apply filters
      if (filters.commercial) query = query.eq('commercial_id', filters.commercial);
      if (filters.startDate) query = query.gte('visit_date', filters.startDate);
      if (filters.endDate) query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      if (filters.status === 'in_progress') query = query.eq('status', 'in_progress');
      if (filters.status === 'approved') query = query.eq('approval_status', 'approved');

      const { data: visitsData, error } = await query;
      if (error) throw error;

      const visits = visitsData || [];

      // Collect all client_ids, commercial_ids, second_commercial_ids, company_ids
      const clientIds = Array.from(new Set(visits.map(v => v.client_id)));
      const commercialIds = Array.from(new Set(visits.map(v => v.commercial_id)));
      const secondCommercialIds = Array.from(new Set(visits.map(v => v.second_commercial_id).filter(Boolean)));
      const companyIds = Array.from(new Set(visits.map(v => v.company_id).filter(Boolean)));

      const [{ data: clients }, { data: profiles }, { data: secondProfiles }, { data: companies }] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, nombre_apellidos, dni').in('id', clientIds) : Promise.resolve({ data: [] }),
        commercialIds.length ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', commercialIds) : Promise.resolve({ data: [] }),
        secondCommercialIds.length ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', secondCommercialIds) : Promise.resolve({ data: [] }),
        companyIds.length ? supabase.from('companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] }),
      ]);

      const clientMap = new Map((clients || []).map(c => [c.id, c]));
      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const secondProfileMap = new Map((secondProfiles || []).map(p => [p.id, p]));
      const companyMap = new Map((companies || []).map(c => [c.id, c]));

      const enrichedVisits = visits.map(v => ({
        ...v,
        client: clientMap.get(v.client_id) || { nombre_apellidos: 'Sin nombre', dni: '-' },
        commercial: profileMap.get(v.commercial_id) || null,
        second_commercial: v.second_commercial_id ? secondProfileMap.get(v.second_commercial_id) || null : null,
        company: v.company_id ? companyMap.get(v.company_id) || null : null
      }));

      // Apply DNI filter client-side
      const filteredVisits = filters.dni
        ? enrichedVisits.filter(v => v.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase()))
        : enrichedVisits;

      setVisits(filteredVisits);
      setVisitsPagination(prev => ({ ...prev, totalItems: filteredVisits.length }));
    } catch (error) {
      console.error('Error fetching visits:', error);
      toast({ title: 'Error', description: 'Error al cargar las visitas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleViewVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    const relatedSales = sales.filter(sale => sale.visit_id === visit.id);
    setVisitSales(relatedSales);
  };

  const handleAdminManageVisit = (visit: Visit) => {
    setAdminManagementVisit(visit);
    setAdminDialogOpen(true);
  };

  const handleAdminDialogClose = () => {
    setAdminDialogOpen(false);
    setAdminManagementVisit(null);
  };

  const handleVisitUpdated = () => {
    fetchVisits();
    fetchSales();
  };

  const handleCreateReminder = (visit: Visit) => {
    setSelectedClientForReminder({ id: visit.client_id, name: visit.client?.nombre_apellidos || 'Sin nombre' });
    setReminderDialogOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ commercial: '', dni: '', startDate: '', endDate: '', status: '' });
  };

  useEffect(() => {
    if (userRole?.role === 'admin') {
      const debounceTimer = setTimeout(fetchVisits, 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [filters, userRole]);

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    const name = [commercial.first_name, commercial.last_name].filter(Boolean).join(' ');
    return name || commercial.email;
  };

  if (userRole?.role !== 'admin') return null;

  const paginatedVisits = visits.slice(
    (visitsPagination.currentPage - 1) * visitsPagination.pageSize,
    visitsPagination.currentPage * visitsPagination.pageSize
  );

  const totalPages = Math.ceil(visits.length / visitsPagination.pageSize);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Visitas</h1>
          <p className="text-muted-foreground">Vista completa de todas las visitas de comerciales</p>
        </div>
      </div>

      {/* FILTERS */}
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
                <SelectTrigger><SelectValue placeholder="Todos los comerciales" /></SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {commercials.map(c => <SelectItem key={c.id} value={c.id}>{getCommercialName(c)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>DNI Cliente</Label>
              <Input placeholder="DNI del cliente..." value={filters.dni} onChange={e => handleFilterChange('dni', e.target.value)} />
            </div>

            <div>
              <Label>Estado</Label>
              <Select value={filters.status || undefined} onValueChange={v => handleFilterChange('status', v === 'all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Todos los estados" /></SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los estados</SelectItem>
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

      {/* VISITS TABLE */}
      <Card>
        <CardHeader><CardTitle>Lista de visitas ({visits.length})</CardTitle></CardHeader>
        <CardContent>
          <VisitsTable
            visits={paginatedVisits as any}
            sales={sales}
            onViewVisit={handleViewVisit as any}
            onAdminManageVisit={handleAdminManageVisit as any}
            onCreateReminder={handleCreateReminder as any}
            loading={loading}
            showClientColumns={true}
            emptyMessage="No se encontraron visitas con los filtros aplicados"
          />
          {visits.length > visitsPagination.pageSize && (
            <div className="mt-4">
              <ClientPagination
                currentPage={visitsPagination.currentPage}
                totalPages={totalPages}
                pageSize={visitsPagination.pageSize}
                totalItems={visits.length}
                onPageChange={page => setVisitsPagination(prev => ({ ...prev, currentPage: page }))}
                onPageSizeChange={pageSize => setVisitsPagination(prev => ({ ...prev, pageSize, currentPage: 1 }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* DIALOGS */}
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
        onVisitUpdated={handleVisitUpdated}
      />
      <ReminderDialog
        open={reminderDialogOpen}
        onOpenChange={setReminderDialogOpen}
        clientId={selectedClientForReminder?.id || ''}
        clientName={selectedClientForReminder?.name || ''}
        onReminderCreated={() => fetchVisits()}
      />
    </div>
  );
}
