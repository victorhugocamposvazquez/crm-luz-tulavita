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
  
  // Pagination
  const [visitsPagination, setVisitsPagination] = useState({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0
  });

  // Reminder dialog
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

  // Fetch commercials
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
        .select('id, first_name, last_name, email')
        .in('id', (await supabase.from('user_roles').select('user_id').eq('role', 'commercial')).data?.map(r => r.user_id) || []);
      if (error) throw error;
      setCommercials(data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchSales = async () => {
    try {
      const { data: salesData, error } = await supabase.from('sales').select('*');
      if (error) throw error;
      setSales(salesData || []);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchVisits = async () => {
    try {
      setLoading(true);

      let query = supabase.from('visits').select('*').order('visit_date', { ascending: false });

      // Apply filters
      if (filters.commercial) query = query.eq('commercial_id', filters.commercial);
      if (filters.startDate) query = query.gte('visit_date', filters.startDate);
      if (filters.endDate) query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      if (filters.status) {
        if (filters.status === 'in_progress') query = query.eq('status', 'in_progress');
        else if (filters.status === 'approved') query = query.eq('approval_status', 'approved');
      }

      const { data: visitsData, error } = await query;
      if (error) throw error;
      const visitsFetched = visitsData || [];

      // Fetch related data separately
      const clientIds = Array.from(new Set(visitsFetched.map(v => v.client_id).filter(Boolean)));
      const commercialIds = Array.from(new Set(visitsFetched.map(v => v.commercial_id).filter(Boolean)));
      const secondCommercialIds = Array.from(new Set(visitsFetched.map(v => v.second_commercial_id).filter(Boolean)));
      const companyIds = Array.from(new Set(visitsFetched.map(v => v.company_id).filter(Boolean)));

      const [{ data: clients }, { data: commercialProfiles }, { data: secondCommercialProfiles }, { data: companies }] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('*').in('id', clientIds) : Promise.resolve({ data: [] }),
        commercialIds.length ? supabase.from('profiles').select('*').in('id', commercialIds) : Promise.resolve({ data: [] }),
        secondCommercialIds.length ? supabase.from('profiles').select('*').in('id', secondCommercialIds) : Promise.resolve({ data: [] }),
        companyIds.length ? supabase.from('companies').select('*').in('id', companyIds) : Promise.resolve({ data: [] }),
      ]);

      const clientMap = new Map((clients || []).map(c => [c.id, c]));
      const commercialMap = new Map((commercialProfiles || []).map(c => [c.id, c]));
      const secondCommercialMap = new Map((secondCommercialProfiles || []).map(c => [c.id, c]));
      const companyMap = new Map((companies || []).map(c => [c.id, c]));

      let enrichedVisits = visitsFetched.map(v => ({
        ...v,
        client: clientMap.get(v.client_id) || null,
        commercial: commercialMap.get(v.commercial_id) || null,
        second_commercial: v.second_commercial_id ? secondCommercialMap.get(v.second_commercial_id) || null : null,
        company: companyMap.get(v.company_id) || null
      }));

      // Apply DNI filter client-side
      if (filters.dni) {
        enrichedVisits = enrichedVisits.filter(v => v.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase()));
      }

      setVisits(enrichedVisits);
      setVisitsPagination(prev => ({ ...prev, totalItems: enrichedVisits.length }));

    } catch (error) {
      console.error(error);
      toast({ title: "Error", description: "Error al cargar visitas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: string) => setFilters(prev => ({ ...prev, [key]: value }));
  const clearFilters = () => setFilters({ commercial: '', dni: '', startDate: '', endDate: '', status: '' });

  useEffect(() => {
    if (userRole?.role === 'admin') {
      const timer = setTimeout(() => fetchVisits(), 300);
      return () => clearTimeout(timer);
    }
  }, [filters]);

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
    if (!visit.client) return;
    setSelectedClientForReminder({ id: visit.client_id, name: visit.client.nombre_apellidos });
    setReminderDialogOpen(true);
  };

  const getCommercialName = (c: any) => {
    if (!c) return 'Sin comercial';
    return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.email;
  };

  if (userRole?.role !== 'admin') return null;

  const paginatedVisits = visits.slice(
    (visitsPagination.currentPage - 1) * visitsPagination.pageSize,
    visitsPagination.currentPage * visitsPagination.pageSize
  );
  const totalPages = Math.ceil(visits.length / visitsPagination.pageSize);

  return (
    <div className="space-y-6">
      {/* Filtros, Tabla, Diálogos */}
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
            <ClientPagination
              currentPage={visitsPagination.currentPage}
              totalPages={totalPages}
              pageSize={visitsPagination.pageSize}
              totalItems={visits.length}
              onPageChange={(page) => setVisitsPagination(prev => ({ ...prev, currentPage: page }))}
              onPageSizeChange={(pageSize) => setVisitsPagination(prev => ({ ...prev, pageSize, currentPage: 1 }))}
            />
          )}
        </CardContent>
      </Card>

      <VisitDetailsDialog visit={selectedVisit} sales={visitSales} onClose={() => setSelectedVisit(null)} onAdminManageVisit={handleAdminManageVisit} showClientInfo={true} />

      <AdminVisitManagementDialog visit={adminManagementVisit} isOpen={adminDialogOpen} onClose={handleAdminDialogClose} onVisitUpdated={fetchVisits} />

      <ReminderDialog open={reminderDialogOpen} onOpenChange={setReminderDialogOpen} clientId={selectedClientForReminder?.id || ''} clientName={selectedClientForReminder?.name || ''} onReminderCreated={fetchVisits} />
    </div>
  );
}
