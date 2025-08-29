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
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import { calculateCommission } from '@/lib/commission';
import ClientPagination from '@/components/dashboard/ClientPagination';

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  approval_status: 'pending' | 'approved' | 'rejected' | 'waiting_admin';
  notes?: string;
  permission: string;
  commercial_id: string;
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
  client?: {
    nombre_apellidos: string;
    dni: string;
    direccion: string;
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
    product_name: string;
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
  const [filters, setFilters] = useState({
    commercial: '',
    dni: '',
    startDate: new Date().toISOString().split('T')[0], // Fecha de hoy por defecto
    endDate: '',
    status: '' // Nuevo filtro de estado
  });
  
  // Pagination state for visits view
  const [visitsPagination, setVisitsPagination] = useState({
    currentPage: 1,
    pageSize: 20,
    totalItems: 0
  });

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

      // Fetch sale lines separately for each sale to avoid relation errors
      const salesWithLines = await Promise.all((salesData || []).map(async (sale) => {
        const { data: linesData, error: linesError } = await supabase
          .from('sale_lines')
          .select('product_name, quantity, unit_price, financiada, transferencia, nulo')
          .eq('sale_id', sale.id);

        // Calculate commission using the new system
        const commissionPercentage = sale.commission_percentage || 0;
        const calculatedCommission = sale.commission_amount || calculateCommission(sale.amount);

        return {
          ...sale,
          sale_lines: linesError ? [] : (linesData || []),
          commission_amount: calculatedCommission
        };
      }));

      setSales(salesWithLines);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchVisits = async () => {
    try {
      setLoading(true);
      
      // Fetch visits first
      let query = supabase
        .from('visits')
        .select(`
          *,
          visit_states (
            name,
            description
          )
        `)
        .order('visit_date', { ascending: false });

      // Apply filters
      if (filters.commercial) {
        query = query.eq('commercial_id', filters.commercial);
      }
      
      if (filters.startDate) {
        query = query.gte('visit_date', filters.startDate);
      }
      
      if (filters.endDate) {
        query = query.lte('visit_date', filters.endDate + 'T23:59:59.999Z');
      }

      // Aplicar filtro de estado
      if (filters.status === 'in_progress') {
        query = query.eq('status', 'in_progress');
      } else if (filters.status === 'approved') {
        query = query.eq('approval_status', 'approved');
      }

      const { data: visitsData, error } = await query;

      if (error) throw error;

      const visits = visitsData || [];

      // Batch-load related data
      const commercialIds = Array.from(new Set(visits.map(v => v.commercial_id).filter(Boolean)));
      const clientIds = Array.from(new Set(visits.map(v => v.client_id).filter(Boolean)));
      const companyIds = Array.from(new Set(visits.map(v => v.company_id).filter(Boolean)));

      const [{ data: profiles }, { data: clients }, { data: companies }] = await Promise.all([
        commercialIds.length
          ? supabase.from('profiles').select('id, first_name, last_name, email').in('id', commercialIds)
          : Promise.resolve({ data: [], error: null } as any),
        clientIds.length
          ? supabase.from('clients').select('id, nombre_apellidos, dni, direccion').in('id', clientIds)
          : Promise.resolve({ data: [], error: null } as any),
        companyIds.length
          ? supabase.from('companies').select('id, name').in('id', companyIds)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const clientMap = new Map((clients || []).map(c => [c.id, c]));
      const companyMap = new Map((companies || []).map(c => [c.id, c]));

      let enrichedVisits = visits.map(v => ({
        ...v,
        commercial: profileMap.get(v.commercial_id) || null,
        client: clientMap.get(v.client_id) || null,
        company: companyMap.get(v.company_id) || null,
      }));

      // Apply DNI filter client-side since it's a nested field
      if (filters.dni) {
        enrichedVisits = enrichedVisits.filter(visit => {
          const client = visit.client as any;
          return client?.dni?.toLowerCase().includes(filters.dni.toLowerCase());
        });
      }

      setVisits(enrichedVisits as Visit[]);
      
      // Update pagination total items
      setVisitsPagination(prev => ({
        ...prev,
        totalItems: enrichedVisits.length
      }));
    } catch (error) {
      console.error('Error fetching visits:', error);
      toast({
        title: "Error",
        description: "Error al cargar las visitas",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    // Find sales for this specific visit
    const relatedSales = sales.filter(sale => sale.visit_id === visit.id);
    setVisitSales(relatedSales);
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({
      commercial: '',
      dni: '',
      startDate: new Date().toISOString().split('T')[0], // Mantener fecha de hoy por defecto
      endDate: '',
      status: ''
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value.trim() !== '');

  // Apply filters when they change
  useEffect(() => {
    if (userRole?.role === 'admin') {
      const debounceTimer = setTimeout(() => {
        fetchVisits();
      }, 300);
      return () => clearTimeout(debounceTimer);
    }
  }, [filters, userRole]);

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    const name = [commercial.first_name, commercial.last_name].filter(Boolean).join(' ');
    return name || commercial.email;
  };

  if (userRole?.role !== 'admin') {
    return null;
  }

  // Paginated visits
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
              <Select
                value={filters.commercial || undefined}
                onValueChange={(value) => handleFilterChange('commercial', value === 'all' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los comerciales" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {commercials.map((commercial) => (
                    <SelectItem key={commercial.id} value={commercial.id}>
                      {getCommercialName(commercial)}
                    </SelectItem>
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

      {/* Visits Table - USANDO COMPONENTE COMÚN */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de visitas ({visits.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <VisitsTable
            visits={paginatedVisits as any}
            sales={sales}
            onViewVisit={handleViewVisit as any}
            loading={loading}
            showClientColumns={true}
            emptyMessage="No se encontraron visitas con los filtros aplicados"
          />
          {/* Pagination for visits */}
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

      {/* Visit Detail Dialog - USANDO COMPONENTE COMÚN */}
      <VisitDetailsDialog
        selectedVisit={selectedVisit as any}
        visitSales={visitSales}
        onClose={() => setSelectedVisit(null)}
        showClientInfo={true}
      />
    </div>
  );
}