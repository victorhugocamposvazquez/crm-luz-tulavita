import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { Search, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import VisitsTable from '@/components/visits/VisitsTable';
import ClientPagination from '@/components/dashboard/ClientPagination';
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import AdminVisitManagementDialog from '@/components/admin/AdminVisitManagementDialog';
import ReminderDialog from '@/components/reminders/ReminderDialog';

export default function AdminVisitsView() {
  const { userRole } = useAuth();
  const [visits, setVisits] = useState<any[]>([]);
  const [sales, setSales] = useState<any[]>([]);
  const [commercials, setCommercials] = useState<any[]>([]);
  const [commercialSearch, setCommercialSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<any>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);
  const [adminManagementVisit, setAdminManagementVisit] = useState<any>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    commercial: '',
    dni: '',
    startDate: new Date().toISOString().split('T')[0],
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
      toast({ title: "Acceso denegado", description: "Solo los administradores pueden acceder a esta vista", variant: "destructive" });
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
        .in('id', (await supabase.from('user_roles').select('user_id').eq('role', 'commercial')).data?.map(r => r.user_id) || []);
      if (error) throw error;
      setCommercials(data || []);
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const fetchSales = async () => {
    try {
      const { data: salesData, error } = await supabase.from('sales').select('id, amount, sale_date, commission_percentage, commission_amount, visit_id');
      if (error) throw error;
      setSales(salesData || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      setLoading(true);
      let query = supabase.from('visits').select('*, visit_states(name, description)').order('visit_date', { ascending: false });
      if (filters.commercial) query = query.eq('commercial_id', filters.commercial);
      if (filters.startDate) query = query.gte('visit_date', filters.startDate);
      if (filters.endDate) query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      if (filters.status === 'in_progress') query = query.eq('status', 'in_progress');
      else if (filters.status === 'approved') query = query.eq('approval_status', 'approved');
      const { data, error } = await query;
      if (error) throw error;
      setVisits(data || []);
      setVisitsPagination(prev => ({ ...prev, totalItems: (data || []).length }));
    } catch (error) {
      console.error('Error fetching visits:', error);
      toast({ title: "Error", description: "Error al cargar las visitas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({ commercial: '', dni: '', startDate: new Date().toISOString().split('T')[0], endDate: '', status: '' });
  const hasActiveFilters = Object.values(filters).some(value => value.trim() !== '');

  useEffect(() => {
    if (userRole?.role === 'admin') {
      const debounceTimer = setTimeout(() => fetchVisits(), 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [filters, userRole]);

  const filteredCommercials = commercials.filter(c => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
    const email = c.email.toLowerCase();
    const search = commercialSearch.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    const name = [commercial.first_name, commercial.last_name].filter(Boolean).join(' ');
    return name || commercial.email;
  };

  if (userRole?.role !== 'admin') return null;

  const paginatedVisits = visits.slice((visitsPagination.currentPage - 1) * visitsPagination.pageSize, visitsPagination.currentPage * visitsPagination.pageSize);
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
            {hasActiveFilters && (
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
              <Input
                id="commercialSearch"
                placeholder="Buscar comercial..."
                value={commercialSearch}
                onChange={(e) => setCommercialSearch(e.target.value)}
                className="mb-2"
              />
              <Select
                value={filters.commercial || undefined}
                onValueChange={(value) => handleFilterChange('commercial', value === 'all' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los comerciales" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {filteredCommercials.map(c => (
                    <SelectItem key={c.id} value={c.id}>{getCommercialName(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="dni">DNI Cliente</Label>
              <Input id="dni" placeholder="DNI del cliente..." value={filters.dni} onChange={(e) => handleFilterChange('dni', e.target.value)} />
            </div>

            <div>
              <Label htmlFor="status">Estado</Label>
              <Select value={filters.status || undefined} onValueChange={(value) => handleFilterChange('status', value === 'all' ? '' : value)}>
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
              <Input id="startDate" type="date" value={filters.startDate} onChange={(e) => handleFilterChange('startDate', e.target.value)} />
            </div>

            <div>
              <Label htmlFor="endDate">Fecha hasta</Label>
              <Input id="endDate" type="date" value={filters.endDate} onChange={(e) => handleFilterChange('endDate', e.target.value)} />
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
          <VisitsTable visits={paginatedVisits} sales={sales} onViewVisit={setSelectedVisit} onAdminManageVisit={setAdminManagementVisit} onCreateReminder={() => {}} loading={loading} showClientColumns={true} emptyMessage="No se encontraron visitas con los filtros aplicados" />
          {visits.length > visitsPagination.pageSize && (
            <div className="mt-4">
              <ClientPagination currentPage={visitsPagination.currentPage} totalPages={totalPages} pageSize={visitsPagination.pageSize} totalItems={visits.length} onPageChange={(page) => setVisitsPagination(prev => ({ ...prev, currentPage: page }))} onPageSizeChange={(pageSize) => setVisitsPagination(prev => ({ ...prev, pageSize, currentPage: 1 }))} />
            </div>
          )}
        </CardContent>
      </Card>

      <VisitDetailsDialog visit={selectedVisit} sales={visitSales} onClose={() => setSelectedVisit(null)} onAdminManageVisit={setAdminManagementVisit} showClientInfo={true} />
      <AdminVisitManagementDialog visit={adminManagementVisit} isOpen={adminDialogOpen} onClose={() => setAdminDialogOpen(false)} onVisitUpdated={fetchVisits} />
      <ReminderDialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen} clientId={selectedClientForReminder?.id || ''} clientName={selectedClientForReminder?.name || ''} onReminderCreated={fetchVisits} />
    </div>
  );
}
