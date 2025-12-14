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
import { calculateCommission, calculateSaleCommission } from '@/lib/commission';
import ClientPagination from '@/components/dashboard/ClientPagination';
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import AdminVisitManagementDialog from '@/components/admin/AdminVisitManagementDialog';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  visit_states?: { name: string; description: string };
  commercial?: { first_name: string | null; last_name: string | null; email: string };
  second_commercial?: { first_name: string | null; last_name: string | null; email: string };
  client?: { id: string; nombre_apellidos: string; dni?: string };
  company?: { name: string };
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
  commission_amount: number;
  visit_id: string;
  sale_lines?: { quantity: number; unit_price: number; nulo: boolean }[];
}

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
    startDate: '',
    endDate: '',
    status: ''
  });

  const [visitsPagination, setVisitsPagination] = useState({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0
  });

  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClientForReminder, setSelectedClientForReminder] = useState<{ id: string; name: string } | null>(null);

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
      fetchSales();
      fetchVisits();
    }
  }, [userRole]);

  const fetchCommercials = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email');
      if (error) throw error;
      setCommercials(data || []);
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const { data: salesData, error } = await supabase.from('sales').select('*');
      if (error) throw error;
      setSales(salesData || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      setLoading(true);

      // Traer todas las visitas sin filtrar
      let query = supabase.from('visits').select('*').order('visit_date', { ascending: false });

      if (filters.commercial) query = query.eq('commercial_id', filters.commercial);
      if (filters.startDate) query = query.gte('visit_date', filters.startDate);
      if (filters.endDate) query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      if (filters.status === 'in_progress') query = query.eq('status', 'in_progress');
      if (filters.status === 'approved') query = query.eq('approval_status', 'approved');

      const { data: visitsData, error } = await query;
      if (error) throw error;

      const allVisits = visitsData || [];

      // IDs únicos de clientes y comerciales
      const clientIds = Array.from(new Set(allVisits.map(v => v.client_id).filter(Boolean)));
      const commercialIds = Array.from(new Set(allVisits.map(v => v.commercial_id).filter(Boolean)));
      const secondCommercialIds = Array.from(new Set(allVisits.map(v => v.second_commercial_id).filter(Boolean)));

      const [clientsResp, commercialsResp, secondCommercialsResp] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [] }),
        commercialIds.length ? supabase.from('profiles').select('*').in('id', commercialIds) : Promise.resolve({ data: [] }),
        secondCommercialIds.length ? supabase.from('profiles').select('*').in('id', secondCommercialIds) : Promise.resolve({ data: [] }),
      ]);

      const clientMap = new Map((clientsResp.data || []).map(c => [c.id, c]));
      const commercialMap = new Map((commercialsResp.data || []).map(c => [c.id, c]));
      const secondCommercialMap = new Map((secondCommercialsResp.data || []).map(c => [c.id, c]));

      let enrichedVisits = allVisits.map(v => ({
        ...v,
        client: clientMap.get(v.client_id) || null,
        commercial: commercialMap.get(v.commercial_id) || null,
        second_commercial: v.second_commercial_id ? secondCommercialMap.get(v.second_commercial_id) || null : null,
      }));

      if (filters.dni) {
        enrichedVisits = enrichedVisits.filter(v => v.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase()));
      }

      setVisits(enrichedVisits);
      setVisitsPagination(prev => ({ ...prev, totalItems: enrichedVisits.length }));
    } catch (error) {
      console.error('Error fetching visits:', error);
      toast({ title: "Error", description: "Error al cargar las visitas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ commercial: '', dni: '', startDate: '', endDate: '', status: '' });
  };

  useEffect(() => {
    if (userRole?.role === 'admin') {
      const debounceTimer = setTimeout(() => fetchVisits(), 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [filters, userRole]);

  const handleViewVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    const relatedSales = sales.filter(s => s.visit_id === visit.id);
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

  const handleCreateReminder = (visit: Visit) => {
    setSelectedClientForReminder({ id: visit.client_id, name: visit.client?.nombre_apellidos || '' });
    setReminderDialogOpen(true);
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Visitas</h1>
          <p className="text-muted-foreground">Vista completa de todas las visitas de comerciales</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>Filtros</span>
            </div>
            {Object.values(filters).some(v => v) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 w-6 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <Label htmlFor="commercial">Comercial</Label>
              <Select
                value={filters.commercial || undefined}
                onValueChange={(value) => handleFilterChange('commercial', value === 'all' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los comerciales" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {commercials.map(c => (
                    <SelectItem key={c.id} value={c.id}>{getCommercialName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="dni">DNI Cliente</Label>
              <Input
                id="dni"
                placeholder="DNI del cliente..."
                value={filters.dni}
                onChange={(e) => handleFilterChange('dni', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select
                value={filters.status || undefined}
                onValueChange={(value) => handleFilterChange('status', value === 'all' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="approved">Confirmadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="startDate">Fecha desde</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">Fecha hasta</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visits Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de visitas ({visits.length})</CardTitle>
        </CardHeader>
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
                onPageChange={(page) => setVisitsPagination(prev => ({ ...prev, currentPage: page }))}
                onPageSizeChange={(pageSize) => setVisitsPagination(prev => ({ ...prev, pageSize, currentPage: 1 }))}
              />
            </div>
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
