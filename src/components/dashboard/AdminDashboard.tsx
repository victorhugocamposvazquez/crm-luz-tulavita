import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import AdminNotifications from '@/components/dashboard/AdminNotifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, Euro, MapPin, TrendingUp, Eye, Bell, Settings } from 'lucide-react';
import { formatCoordinates } from '@/lib/coordinates';
import { calculateCommission, calculateTotalExcludingNulls, calculateSaleCommission, calculateEffectiveAmount } from '@/lib/commission';
import { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import ReminderDialog from '@/components/reminders/ReminderDialog';
import ClientPagination from '@/components/dashboard/ClientPagination';
import AdminVisitManagementDialog from '@/components/admin/AdminVisitManagementDialog';

interface Sale {
  id: string;
  sale_date: string;
  amount: number;
  commission_percentage: number;
  commission_amount: number;
  sale_lines?: Array<{ quantity: number; unit_price: number; nulo: boolean }>;
  client: {
    nombre_apellidos: string;
    dni: string;
  };
  company: {
    name: string;
  };
  commercial?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Visit {
  id: string;
  visit_date: string;
  status: string;
  approval_status: string;
  client_id: string;
  commercial_id: string;
  second_commercial_id?: string;
  visit_state_code?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  client: {
    id: string;
    nombre_apellidos: string;
    dni: string;
  };
  company: {
    name: string;
  };
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  notes: string;
  sales?: any[];
  visit_states?: {
    name: string;
    description: string;
  };
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { pendingTasks, pendingApprovals } = useRealtimeNotifications();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalClients: 0,
    todaySales: { count: 0, amount: 0 },
    todayVisits: 0,
    monthSales: 0,
    totalSales: 0
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [monthlySalesData, setMonthlySalesData] = useState<any[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);
  const [adminManagementVisit, setAdminManagementVisit] = useState<Visit | null>(null);
  const [adminDialogOpen, setAdminDialogOpen] = useState(false);
  const [selectedCommercial, setSelectedCommercial] = useState<string>('all');
  const [commercials, setCommercials] = useState<any[]>([]);
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClientForReminder, setSelectedClientForReminder] = useState<{id: string, name: string} | null>(null);
  
  // Pagination state for completed visits
  const [completedVisitsPagination, setCompletedVisitsPagination] = useState({
    currentPage: 1,
    pageSize: 10,
    totalItems: 0
  });

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user, selectedCommercial]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const startToday = startOfDay(today);
      const endToday = endOfDay(today);
      const thirtyDaysAgo = subDays(new Date(), 30);
      const sixMonthsAgo = subMonths(new Date(), 6);
      const startOfCurrentMonth = startOfMonth(today);

      // Fetch total clients count
      const { count: clientsCount, error: clientsError } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      if (clientsError) throw clientsError;

      // Fetch today's sales
      const { data: todaySalesData, error: todaySalesError } = await supabase
        .from('sales')
        .select(`
          amount,
          sale_lines(quantity, unit_price, nulo)
        `)
        .gte('sale_date', startToday.toISOString())
        .lte('sale_date', endToday.toISOString());

      if (todaySalesError) throw todaySalesError;

      const todaySalesAmount = todaySalesData?.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0) || 0;

      // Fetch today's visits count
      const { count: todayVisitsCount, error: todayVisitsError } = await supabase
        .from('visits')
        .select('*', { count: 'exact', head: true })
        .gte('visit_date', startToday.toISOString())
        .lte('visit_date', endToday.toISOString());

      if (todayVisitsError) throw todayVisitsError;

      // Fetch current month sales
      const { data: monthSalesData, error: monthSalesError } = await supabase
        .from('sales')
        .select(`
          amount,
          sale_lines(quantity, unit_price, nulo)
        `)
        .gte('sale_date', startOfCurrentMonth.toISOString());

      if (monthSalesError) throw monthSalesError;

      const monthSalesAmount = monthSalesData?.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0) || 0;

      // Fetch total sales (without filters) for the stats card
      const { data: totalSalesData, error: totalSalesError } = await supabase
        .from('sales')
        .select(`
          amount,
          sale_lines(quantity, unit_price, nulo)  
        `)
        .gte('sale_date', thirtyDaysAgo.toISOString());

      if (totalSalesError) throw totalSalesError;

      const totalSalesAmount = totalSalesData?.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0) || 0;

      setStats({
        totalClients: clientsCount || 0,
        todaySales: { count: todaySalesData?.length || 0, amount: todaySalesAmount },
        todayVisits: todayVisitsCount || 0,
        monthSales: monthSalesAmount,
        totalSales: totalSalesAmount
      });

      // Fetch commercials for filter (first get commercial user IDs, then their profiles)
      const { data: commercialRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'commercial');

      if (rolesError) throw rolesError;

      if (commercialRoles && commercialRoles.length > 0) {
        const commercialIds = commercialRoles.map(role => role.user_id);
        
        const { data: commercialsData, error: commercialsError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', commercialIds);

        if (commercialsError) throw commercialsError;
        setCommercials(commercialsData || []);
      } else {
        setCommercials([]);
      }

      // Build sales query with optional commercial filter  
      let salesQuery = supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          amount,
          commission_percentage,
          commission_amount,
          commercial_id,
          sale_lines(quantity, unit_price, nulo),
          client:clients(nombre_apellidos, dni),
          company:companies(name)
        `)
        .gte('sale_date', thirtyDaysAgo.toISOString())
        .order('sale_date', { ascending: false });

      if (selectedCommercial !== 'all') {
        salesQuery = salesQuery.eq('commercial_id', selectedCommercial);
      }

      const { data: salesData, error: salesError } = await salesQuery;
      if (salesError) throw salesError;

      // OPTIMIZACIÓN N+1: Fetch commercial data in batch instead of individual queries
      const commercialIds = [...new Set((salesData || []).map(sale => sale.commercial_id).filter(Boolean))];
      const commercialsMap = new Map();
      
      if (commercialIds.length > 0) {
        const { data: commercialsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', commercialIds);
        
        (commercialsData || []).forEach(commercial => {
          commercialsMap.set(commercial.id, commercial);
        });
      }

      const salesWithCommercials = (salesData || []).map((sale) => ({
        ...sale,
        commission_amount: calculateSaleCommission(sale, false), // En listados mostrar comisión completa
        commercial: commercialsMap.get(sale.commercial_id) || null
      }));

      setSales(salesWithCommercials);

// Build visits query with optional commercial filter (SIN sales anidadas)
let visitsQuery = supabase
  .from('visits')
  .select(`
    id,
    visit_date,
    status,
    approval_status,
    notes,
    client_id,
    commercial_id,
    second_commercial_id,
    visit_state_code,
    latitude,
    longitude,
    location_accuracy,
    visit_states (
      name,
      description
    ),
    client:clients(id, nombre_apellidos, dni),
    company:companies(name)
  `)
  .gte('visit_date', thirtyDaysAgo.toISOString())
  .order('visit_date', { ascending: false });

if (selectedCommercial !== 'all') {
  visitsQuery = visitsQuery.or(`commercial_id.eq.${selectedCommercial},second_commercial_id.eq.${selectedCommercial}`);
}

const { data: visitsData, error: visitsError } = await visitsQuery;
if (visitsError) throw visitsError;

// Map to ensure client is never null
const visitsWithSales = (visitsData || []).map((visit) => {
  const visitSales = visitSales.get(visit.id) || [];

  return {
    ...visit,
    client: visit.client || { nombre_apellidos: 'Cliente eliminado', dni: '-' }, // <--- Aquí el placeholder
    commercial: commercialsMap.get(visit.commercial_id) || null,
    second_commercial: commercialsMap.get(visit.second_commercial_id) || null,
    sales: visitSales.map(sale => ({
      ...sale,
      commission_amount: calculateSaleCommission(sale, false)
    }))
  };
});

setVisits(visitsWithSales);


      // Fetch monthly sales data for charts
      let monthlySalesQuery = supabase
        .from('sales')
        .select(`
          sale_date, 
          amount,
          sale_lines(quantity, unit_price, nulo)
        `)
        .gte('sale_date', sixMonthsAgo.toISOString())
        .order('sale_date');

      if (selectedCommercial !== 'all') {
        monthlySalesQuery = monthlySalesQuery.eq('commercial_id', selectedCommercial);
      }

      const { data: monthlySales, error: monthlyError } = await monthlySalesQuery;
      if (monthlyError) throw monthlyError;

      // Process monthly data
      const months = eachMonthOfInterval({
        start: sixMonthsAgo,
        end: new Date()
      });

      const monthlyData = months.map(month => {
        const monthSales = monthlySales?.filter(sale => {
          const saleDate = new Date(sale.sale_date);
          return saleDate >= startOfMonth(month) && saleDate <= endOfMonth(month);
        }) || [];

        const totalAmount = monthSales.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0);
        const totalCommission = monthSales.reduce((sum, sale) => sum + calculateSaleCommission(sale, false), 0); // Datos mensuales sin división

        return {
          month: format(month, 'MMM yyyy', { locale: es }),
          ventas: totalAmount,
          comision: totalCommission,
          cantidad: monthSales.length
        };
      });

      setMonthlySalesData(monthlyData);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewVisit = async (visit: Visit) => {
    setSelectedVisit(visit);
    await fetchVisitSales(visit.id);
  };

  const handleCreateReminder = (visit: Visit) => {
    setSelectedClientForReminder({
      id: visit.client_id,
      name: visit.client.nombre_apellidos
    });
    setReminderDialogOpen(true);
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
    fetchDashboardData();
  };

  const handleReminderCreated = () => {
    // Could refetch data here if needed
    setSelectedClientForReminder(null);
    setReminderDialogOpen(false);
  };

  const fetchVisitSales = async (visitId: string) => {
    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id, amount, sale_date')
        .eq('visit_id', visitId)
        .order('sale_date', { ascending: false });

      if (salesError) throw salesError;

      const salesWithLines = await Promise.all((salesData || []).map(async sale => {
        const { data: linesData, error: linesError } = await supabase
          .from('sale_lines')
          .select(`
            id, quantity, unit_price, line_total, financiada, transferencia, nulo,
            sale_lines_products(product_name)
          `)
          .eq('sale_id', sale.id);
        
        if (linesError) {
          console.error('Error fetching sale lines:', linesError);
          return { ...sale, sale_lines: [] };
        }
        
        return { ...sale, sale_lines: linesData || [] };
      }));

      setVisitSales(salesWithLines);
    } catch (error) {
      console.error('Error fetching visit sales:', error);
      setVisitSales([]);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLabels = {
      'in_progress': 'En progreso',
    'completed': 'Confirmada',
    'ausente': 'Ausente', 
    'nulo': 'Sin resultado',
    'oficina': 'Derivado a oficina'
    };

    const statusColors = {
      'in_progress': 'bg-blue-100 text-blue-800',
    'completed': 'bg-green-100 text-green-800',
    'ausente': 'bg-gray-100 text-gray-800',
    'nulo': 'bg-red-100 text-red-800',
    'oficina': 'bg-yellow-100 text-yellow-800'
    };

    const label = statusLabels[status as keyof typeof statusLabels] || status;
    const colorClass = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';

    return <Badge className={colorClass}>{label}</Badge>;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: es });
  };

  const renderNotesCell = (visit: Visit) => {
    if (!visit.notes) {
      return (
        <span 
          className="text-muted-foreground cursor-pointer hover:text-muted-foreground/80"
          onClick={() => handleViewVisit(visit)}
        >
          -
        </span>
      );
    }
    
    if (visit.notes.length <= 50) {
      return (
        <span 
          className="cursor-pointer hover:text-foreground/80"
          onClick={() => handleViewVisit(visit)}
        >
          {visit.notes}
        </span>
      );
    }
    
    return (
      <span 
        className="cursor-pointer hover:text-foreground/80"
        onClick={() => handleViewVisit(visit)}
      >
        {visit.notes.substring(0, 50)}...
      </span>
    );
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando dashboard...</div>;
  }

  const totalSales = sales.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0);
  const totalCommissions = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
  const approvedVisits = visits.filter(visit => visit.approval_status === 'approved').length;
  const completedVisits = visits.filter(visit => visit.status === 'completed');
  const inProgressVisits = visits.filter(visit => visit.status === 'in_progress');
  const rejectedVisits = visits.filter(visit => visit.approval_status === 'rejected');
  // Paginated completed visits
  const paginatedCompletedVisits = completedVisits.slice(
    (completedVisitsPagination.currentPage - 1) * completedVisitsPagination.pageSize,
    completedVisitsPagination.currentPage * completedVisitsPagination.pageSize
  );
  
  const totalCompletedVisitsPages = Math.ceil(completedVisits.length / completedVisitsPagination.pageSize);
  
  // Update pagination total items if necessary
  if (completedVisits.length !== completedVisitsPagination.totalItems) {
    setCompletedVisitsPagination(prev => ({
      ...prev,
      totalItems: completedVisits.length
    }));
  }
  
  // Status distribution data for all visit statuses
  const statusLabels = {
    'in_progress': 'En Progreso',
    'completed': 'Confirmada',
    'ausente': 'Ausente',
    'nulo': 'Sin Resultado',
    'oficina': 'Oficina'
  };

  const statusColors = {
    'in_progress': '#3b82f6',
    'completed': '#22c55e',
    'ausente': '#f59e0b',
    'nulo': '#ef4444',
    'oficina': '#8b5cf6'
  };

  // Create visit distribution by actual status
  const visitStatusCounts = visits.reduce((acc, visit) => {
    // Priority: show rejection status first
    if (visit.approval_status === 'rejected') {
      acc['rejected'] = (acc['rejected'] || 0) + 1;
    } else {
      acc[visit.status] = (acc[visit.status] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  const visitDistributionData = Object.entries(visitStatusCounts).map(([status, count]) => ({
    name: status === 'rejected' ? 'Rechazada' : statusLabels[status as keyof typeof statusLabels] || status,
    value: count,
    color: status === 'rejected' ? '#dc2626' : statusColors[status as keyof typeof statusColors] || '#6b7280'
  })).filter(item => item.value > 0);

  const totalNotifications = pendingTasks.length + pendingApprovals.length;

  return (
    <div className="space-y-6">
      {/* Main Content - Full Width */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard administrativo</h1>
          <p className="text-muted-foreground">
            Resumen general y estadísticas del sistema
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
              <p className="text-xs text-muted-foreground">Clientes registrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total ventas</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.totalSales)}</div>
              <p className="text-xs text-muted-foreground">Últimos 30 días</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas hoy</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.todaySales.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.todaySales.count} ventas realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas hoy</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayVisits}</div>
              <p className="text-xs text-muted-foreground">Visitas registradas</p>
            </CardContent>
          </Card>
        </div>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros de estadísticas</CardTitle>
            <CardDescription>Filtra los datos por comercial para análisis específicos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <Label htmlFor="commercial-filter">Comercial:</Label>
              <Select value={selectedCommercial} onValueChange={setSelectedCommercial}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Seleccionar comercial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los comerciales</SelectItem>
                  {commercials.map((commercial) => (
                    <SelectItem key={commercial.id} value={commercial.id}>
                      {commercial.first_name} {commercial.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas (30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
              <p className="text-xs text-muted-foreground">{sales.length} ventas realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Comisiones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalCommissions)}</div>
              <p className="text-xs text-muted-foreground">Estimación según ventas realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas con ventas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{visits.filter(v => v.sales && v.sales.length > 0).length}</div>
              <p className="text-xs text-muted-foreground">
                {visits.length > 0 ? (((visits.filter(v => v.sales && v.sales.length > 0).length / visits.length) * 100).toFixed(1)) : '0'}% del total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas completadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedVisits.length}</div>
              <p className="text-xs text-muted-foreground">De {visits.length} totales</p>
            </CardContent>
          </Card>
        </div>

        {/* Visit States Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {(() => {
            const completedVisitsOnly = visits.filter(visit => visit.status === 'completed');
            const visitStatesCounts = {
              nulo: completedVisitsOnly.filter(v => v.visit_state_code === 'not_interested').length,
              ausente: completedVisitsOnly.filter(v => v.visit_state_code === 'no_answer').length,
              oficina: completedVisitsOnly.filter(v => v.visit_state_code === 'postponed').length,
              confirmado: completedVisitsOnly.filter(v => v.visit_state_code === 'completed').length,
              sinEstado: completedVisitsOnly.filter(v => !v.visit_state_code).length
            };

            const totalWithStates = visitStatesCounts.nulo + visitStatesCounts.ausente + visitStatesCounts.oficina + visitStatesCounts.confirmado;

            return (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Visitas nulas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{visitStatesCounts.nulo}</div>
                    <p className="text-xs text-muted-foreground">
                      {completedVisitsOnly.length > 0 ? ((visitStatesCounts.nulo / completedVisitsOnly.length) * 100).toFixed(1) : '0'}% de completadas
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Visitas ausentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{visitStatesCounts.ausente}</div>
                    <p className="text-xs text-muted-foreground">
                      {completedVisitsOnly.length > 0 ? ((visitStatesCounts.ausente / completedVisitsOnly.length) * 100).toFixed(1) : '0'}% de completadas
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Visitas oficina</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{visitStatesCounts.oficina}</div>
                    <p className="text-xs text-muted-foreground">
                      {completedVisitsOnly.length > 0 ? ((visitStatesCounts.oficina / completedVisitsOnly.length) * 100).toFixed(1) : '0'}% de completadas
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Visitas confirmadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{visitStatesCounts.confirmado}</div>
                    <p className="text-xs text-muted-foreground">
                      {completedVisitsOnly.length > 0 ? ((visitStatesCounts.confirmado / completedVisitsOnly.length) * 100).toFixed(1) : '0'}% de completadas
                      {visitStatesCounts.sinEstado > 0 && ` | ${visitStatesCounts.sinEstado} sin estado`}
                    </p>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolución de ventas (6 meses)</CardTitle>
              <CardDescription>Ventas y comisiones por mes</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlySalesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Line type="monotone" dataKey="ventas" stroke="hsl(var(--primary))" name="Ventas" />
                  <Line type="monotone" dataKey="comision" stroke="hsl(var(--secondary))" name="Comisión" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Distribución de visitas</CardTitle>
              <CardDescription>Análisis de actividad comercial</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                   <Pie
                     data={visitDistributionData}
                     cx="50%"
                     cy="50%"
                     labelLine={false}
                     label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                     outerRadius={80}
                     fill="#8884d8"
                     dataKey="value"
                   >
                    {visitDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Additional Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Distribución por estado de visita</CardTitle>
              <CardDescription>Resultados específicos de las visitas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                      data={(() => {
                        const completedVisitsOnly = visits.filter(visit => visit.status === 'completed');
                        const visitStatesCounts = {
                          nulo: completedVisitsOnly.filter(v => v.visit_state_code === 'not_interested').length,
                          ausente: completedVisitsOnly.filter(v => v.visit_state_code === 'no_answer').length,
                          oficina: completedVisitsOnly.filter(v => v.visit_state_code === 'postponed').length,
                          confirmado: completedVisitsOnly.filter(v => v.visit_state_code === 'completed').length
                        };

                      const stateColors = {
                        nulo: '#ef4444',
                        ausente: '#f59e0b', 
                        oficina: '#8b5cf6',
                        confirmado: '#22c55e'
                      };

                      return Object.entries(visitStatesCounts)
                        .filter(([_, count]) => count > 0)
                        .map(([state, count]) => ({
                          name: state.charAt(0).toUpperCase() + state.slice(1),
                          value: count,
                          color: stateColors[state as keyof typeof stateColors]
                        }));
                    })()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                     {(() => {
                       const completedVisitsOnly = visits.filter(visit => visit.status === 'completed');
                       const visitStatesCounts = {
                         nulo: completedVisitsOnly.filter(v => v.visit_state_code === 'not_interested').length,
                         ausente: completedVisitsOnly.filter(v => v.visit_state_code === 'no_answer').length,
                         oficina: completedVisitsOnly.filter(v => v.visit_state_code === 'postponed').length,
                         confirmado: completedVisitsOnly.filter(v => v.visit_state_code === 'completed').length
                       };

                      const stateColors = {
                        nulo: '#ef4444',
                        ausente: '#f59e0b', 
                        oficina: '#8b5cf6',
                        confirmado: '#22c55e'
                      };

                      return Object.entries(visitStatesCounts)
                        .filter(([_, count]) => count > 0)
                        .map(([state, count], index) => (
                          <Cell key={`cell-${index}`} fill={stateColors[state as keyof typeof stateColors]} />
                        ));
                    })()}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conversión de ventas</CardTitle>
              <CardDescription>Visitas con y sin ventas generadas</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={(() => {
                      const visitsWithSales = visits.filter(v => v.sales && Array.isArray(v.sales) && v.sales.length > 0).length;
                      const visitsWithoutSales = visits.length - visitsWithSales;

                      const chartData = [
                        {
                          name: 'Con ventas',
                          value: visitsWithSales,
                          color: '#22c55e'
                        },
                        {
                          name: 'Sin ventas', 
                          value: visitsWithoutSales,
                          color: '#6b7280'
                        }
                      ].filter(item => item.value > 0);


                      return chartData;
                    })()}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(1)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {(() => {
                      const visitsWithSales = visits.filter(v => v.sales && Array.isArray(v.sales) && v.sales.length > 0).length;
                      const visitsWithoutSales = visits.length - visitsWithSales;

                      return [
                        { color: '#22c55e' },
                        { color: '#6b7280' }
                      ]
                      .slice(0, visitsWithSales > 0 && visitsWithoutSales > 0 ? 2 : 1)
                      .map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ));
                    })()}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Completed Visits with Sales Table */}
        <Card>
          <CardHeader>
            <CardTitle>Visitas completadas - últimos 30 días</CardTitle>
            <CardDescription>Visitas finalizadas con información de ventas asociadas</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Visita</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead>Segundo Comercial</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Resultado de la visita</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Ventas Generadas</TableHead>
                  <TableHead>Comisión Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedCompletedVisits.map((visit) => {
                  const totalSalesAmount = visit.sales?.reduce((sum, sale) => sum + calculateEffectiveAmount(sale), 0) || 0;
                  const totalCommission = visit.sales?.reduce((sum, sale) => sum + sale.commission_amount, 0) || 0;
                  
                  
                  return (
                    <TableRow key={visit.id}>
                      <TableCell>{formatDate(visit.visit_date)}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{visit.client.nombre_apellidos}</div>
                          <div className="text-sm text-muted-foreground">{visit.client.dni}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {visit.commercial ? `${visit.commercial.first_name} ${visit.commercial.last_name}` : 'N/A'}
                      </TableCell>
                      <TableCell>
                        {(visit as any).second_commercial ? 
                          `${(visit as any).second_commercial.first_name} ${(visit as any).second_commercial.last_name}` : 
                          '-'
                        }
                      </TableCell>
                      <TableCell>{visit.company?.name || 'N/A'}</TableCell>
                      <TableCell>
                        {visit.visit_states?.name ? 
                          visit.visit_states.name.charAt(0).toUpperCase() + visit.visit_states.name.slice(1).toLowerCase() 
                          : 'Completada'
                        }
                      </TableCell>
                      <TableCell className="max-w-xs">
                        {renderNotesCell(visit)}
                      </TableCell>
                      <TableCell>
                        {visit.sales && visit.sales.length > 0 ? (
                          <div className="space-y-1">
                            <div className="font-medium text-green-600">
                              {formatCurrency(totalSalesAmount)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {visit.sales.length} venta(s)
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin ventas</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {totalCommission > 0 ? (
                          <div className="font-medium text-green-600">
                            {formatCurrency(totalCommission)}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewVisit(visit)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCreateReminder(visit)}
                            title="Crear recordatorio"
                          >
                            <Bell className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAdminManageVisit(visit)}
                            title="Administrar visita"
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {paginatedCompletedVisits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      {completedVisits.length === 0 ? "No hay visitas completadas en los últimos 30 días" : "No hay más visitas en esta página"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {/* Pagination for completed visits */}
            {completedVisits.length > completedVisitsPagination.pageSize && (
              <div className="mt-4">
                <ClientPagination
                  currentPage={completedVisitsPagination.currentPage}
                  totalPages={totalCompletedVisitsPages}
                  pageSize={completedVisitsPagination.pageSize}
                  totalItems={completedVisits.length}
                  onPageChange={(page) => setCompletedVisitsPagination(prev => ({ ...prev, currentPage: page }))}
                  onPageSizeChange={(pageSize) => setCompletedVisitsPagination(prev => ({ ...prev, pageSize, currentPage: 1 }))}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visit Detail Dialog */}
      {selectedVisit && (
        <Dialog open={!!selectedVisit} onOpenChange={() => setSelectedVisit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles de la Visita</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cliente</Label>
                  <p className="font-medium">{selectedVisit.client.nombre_apellidos}</p>
                </div>
                <div>
                  <Label>DNI</Label>
                  <p>{selectedVisit.client.dni}</p>
                </div>
                <div>
                  <Label>Comercial</Label>
                  <p>{selectedVisit.commercial ? `${selectedVisit.commercial.first_name} ${selectedVisit.commercial.last_name}` : 'N/A'}</p>
                </div>
                <div>
                  <Label>Empresa</Label>
                  <p>{selectedVisit.company.name}</p>
                </div>
                <div>
                  <Label>Fecha</Label>
                  <p>{formatDate(selectedVisit.visit_date)}</p>
                </div>
                <div>
                  <Label>Estado</Label>
                  <div>{getStatusBadge(selectedVisit.status)}</div>
                </div>
                {selectedVisit.visit_states && (
                  <div>
                    <Label>Resultado de la visita</Label>
                    <div>
                      <Badge variant="outline">
                        {selectedVisit.visit_states.name.charAt(0).toUpperCase() + selectedVisit.visit_states.name.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                )}
                {(selectedVisit.latitude && selectedVisit.longitude) && (
                  <div>
                    <Label>Ubicación</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <a 
                        href={`https://maps.google.com/?q=${selectedVisit.latitude},${selectedVisit.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline flex items-center gap-1"
                      >
                        {formatCoordinates(selectedVisit.latitude, selectedVisit.longitude)}
                        <MapPin className="h-3 w-3" />
                      </a>
                      {selectedVisit.location_accuracy && (
                        <span className="text-xs text-muted-foreground">
                          (±{selectedVisit.location_accuracy.toFixed(0)}m)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedVisit.notes && (
                <div>
                  <Label>Notas</Label>
                  <p className="text-sm bg-muted p-2 rounded">{selectedVisit.notes}</p>
                </div>
              )}

              {visitSales.length > 0 && (
                <div>
                  <Label>Ventas</Label>
                  <div className="mt-2 space-y-4">
                    {visitSales.map((sale, index) => (
                      <div key={sale.id} className="border rounded p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">Venta #{index + 1}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(sale.sale_date)}</p>
                          </div>
                          <p className="font-bold text-green-600">{formatCurrency(sale.amount)}</p>
                        </div>
                        
                        {sale.sale_lines && sale.sale_lines.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm font-medium mb-1">Productos:</p>
                            <div className="space-y-1">
                              {sale.sale_lines.map((line: any) => (
                                <div key={line.id} className="text-xs bg-muted/50 p-2 rounded">
                                  <div className="flex justify-between">
                                    <div>
                                      {line.sale_lines_products && line.sale_lines_products.length > 1 ? (
                                        // Pack: mostrar productos en líneas separadas
                                        <div className="space-y-1">
                                          <div className="font-medium">
                                            {line.quantity}x Pack - {formatCurrency(line.unit_price)}
                                          </div>
                                          {line.sale_lines_products.map((product: any, productIndex: number) => (
                                            <div key={productIndex} className="ml-2 text-muted-foreground">
                                              • {product.product_name || 'Sin nombre'}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        // Producto individual
                                        <span>
                                          {line.quantity}x {line.sale_lines_products?.[0]?.product_name || 'Sin producto'} - {formatCurrency(line.unit_price)}
                                        </span>
                                      )}
                                    </div>
                                    <span>{formatCurrency(line.line_total || (line.quantity * line.unit_price))}</span>
                                  </div>
                                  <div className="flex gap-2 mt-1 text-xs">
                                   <span className={`px-2 py-1 rounded ${line.financiada ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.financiada ? '✓' : '✗'} Financiada
                                   </span>
                                   <span className={`px-2 py-1 rounded ${line.transferencia ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.transferencia ? '✓' : '✗'} Transferencia
                                   </span>
                                   <span className={`px-2 py-1 rounded ${line.nulo ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'}`}>
                                     {line.nulo ? '✓' : '✗'} Nulo
                                   </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reminder Dialog */}
      {selectedClientForReminder && (
        <ReminderDialog
          open={reminderDialogOpen}
          onOpenChange={setReminderDialogOpen}
          clientId={selectedClientForReminder.id}
          clientName={selectedClientForReminder.name}
          onReminderCreated={handleReminderCreated}
        />
      )}

      <AdminVisitManagementDialog
        visit={adminManagementVisit}
        isOpen={adminDialogOpen}
        onClose={handleAdminDialogClose}
        onVisitUpdated={handleVisitUpdated}
      />
    </div>
  );
}