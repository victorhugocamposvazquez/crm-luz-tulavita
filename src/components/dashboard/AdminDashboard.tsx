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
import { Users, Euro, MapPin, TrendingUp, Eye } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

interface Sale {
  id: string;
  sale_date: string;
  amount: number;
  commission_percentage: number;
  commission_amount: number;
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
  notes: string;
  sales?: any[];
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { pendingTasks, pendingApprovals } = useRealtimeNotifications();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalClients: 0,
    todaySales: { count: 0, amount: 0 },
    todayVisits: 0,
    monthSales: 0
  });
  const [sales, setSales] = useState<Sale[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [monthlySalesData, setMonthlySalesData] = useState<any[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);
  const [selectedCommercial, setSelectedCommercial] = useState<string>('all');
  const [commercials, setCommercials] = useState<any[]>([]);

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
        .select('amount')
        .gte('sale_date', startToday.toISOString())
        .lte('sale_date', endToday.toISOString());

      if (todaySalesError) throw todaySalesError;

      const todaySalesAmount = todaySalesData?.reduce((sum, sale) => sum + sale.amount, 0) || 0;

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
        .select('amount')
        .gte('sale_date', startOfCurrentMonth.toISOString());

      if (monthSalesError) throw monthSalesError;

      const monthSalesAmount = monthSalesData?.reduce((sum, sale) => sum + sale.amount, 0) || 0;

      setStats({
        totalClients: clientsCount || 0,
        todaySales: { count: todaySalesData?.length || 0, amount: todaySalesAmount },
        todayVisits: todayVisitsCount || 0,
        monthSales: monthSalesAmount
      });

      // Fetch commercials for filter
      const { data: commercialsData, error: commercialsError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .neq('id', user.id); // Exclude admin

      if (commercialsError) throw commercialsError;
      setCommercials(commercialsData || []);

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

      // Fetch commercial data separately to avoid relation issues
      const salesWithCommercials = await Promise.all((salesData || []).map(async (sale) => {
        let commercial = null;
        if (sale.commercial_id) {
          const { data: commercialData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', sale.commercial_id)
            .single();
          commercial = commercialData;
        }

        return {
          ...sale,
          commission_amount: sale.commission_amount || (sale.amount * ((sale.commission_percentage || 5) / 100)),
          commercial
        };
      }));

      setSales(salesWithCommercials);

      // Build visits query with optional commercial filter
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
          client:clients(nombre_apellidos, dni),
          company:companies(name)
        `)
        .gte('visit_date', thirtyDaysAgo.toISOString())
        .order('visit_date', { ascending: false });

      if (selectedCommercial !== 'all') {
        visitsQuery = visitsQuery.eq('commercial_id', selectedCommercial);
      }

      const { data: visitsData, error: visitsError } = await visitsQuery;
      if (visitsError) throw visitsError;

      // For each visit, fetch associated sales and commercial data separately
      const visitsWithSales = await Promise.all((visitsData || []).map(async (visit) => {
        // Fetch commercial data
        let commercial = null;
        if (visit.commercial_id) {
          const { data: commercialData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', visit.commercial_id)
            .single();
          commercial = commercialData;
        }

        // Fetch visit sales
        const { data: visitSales } = await supabase
          .from('sales')
          .select('id, sale_date, amount, commission_percentage, commission_amount')
          .eq('visit_id', visit.id);

        return {
          ...visit,
          commercial,
          sales: visitSales?.map(sale => ({
            ...sale,
            commission_amount: sale.commission_amount || (sale.amount * ((sale.commission_percentage || 5) / 100))
          })) || []
        };
      }));

      setVisits(visitsWithSales);

      // Fetch monthly sales data for charts
      let monthlySalesQuery = supabase
        .from('sales')
        .select('sale_date, amount')
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

        const totalAmount = monthSales.reduce((sum, sale) => sum + sale.amount, 0);
        const totalCommission = totalAmount * 0.05;

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
          .select('id, product_name, quantity, unit_price, line_total')
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

  const getStatusBadge = (status: string, approvalStatus?: string) => {
    if (approvalStatus === 'approved') {
      return <Badge variant="default" className="bg-green-500">Aprobada</Badge>;
    }
    if (approvalStatus === 'rejected') {
      return <Badge variant="destructive">Rechazada</Badge>;
    }
    if (status === 'completed') {
      return <Badge variant="secondary">Completada</Badge>;
    }
    return <Badge variant="outline">Pendiente</Badge>;
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Cargando dashboard...</div>;
  }

  const totalSales = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalCommissions = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
  const approvedVisits = visits.filter(visit => visit.approval_status === 'approved').length;
  const completedVisits = visits.filter(visit => visit.status === 'completed');
  const inProgressVisits = visits.filter(visit => visit.status === 'in_progress');
  const rejectedVisits = visits.filter(visit => visit.approval_status === 'rejected');
  
  // Status distribution data for all visit statuses
  const statusLabels = {
    'in_progress': 'En Progreso',
    'completed': 'Completada',
    'no_answer': 'Sin Respuesta',
    'not_interested': 'No Interesado',
    'postponed': 'Aplazada'
  };

  const statusColors = {
    'in_progress': '#3b82f6',
    'completed': '#22c55e',
    'no_answer': '#f59e0b',
    'not_interested': '#ef4444',
    'postponed': '#8b5cf6'
  };

  // Create visit distribution by actual status
  const visitStatusCounts = visits.reduce((acc, visit) => {
    acc[visit.status] = (acc[visit.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const visitDistributionData = Object.entries(visitStatusCounts).map(([status, count]) => ({
    name: statusLabels[status as keyof typeof statusLabels] || status,
    value: count,
    color: statusColors[status as keyof typeof statusColors] || '#6b7280'
  })).filter(item => item.value > 0);

  const totalNotifications = pendingTasks.length + pendingApprovals.length;

  return (
    <div className="space-y-6">
      {/* Main Content - Full Width */}
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard Administrativo</h1>
          <p className="text-muted-foreground">
            Resumen general y estadísticas del sistema
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalClients}</div>
              <p className="text-xs text-muted-foreground">Clientes registrados</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
              <p className="text-xs text-muted-foreground">{sales.length} ventas totales</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(stats.todaySales.amount)}</div>
              <p className="text-xs text-muted-foreground">{stats.todaySales.count} ventas realizadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas Hoy</CardTitle>
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
            <CardTitle>Filtros de Estadísticas</CardTitle>
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
              <p className="text-xs text-muted-foreground">5% de las ventas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas (30 días)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{visits.length}</div>
              <p className="text-xs text-muted-foreground">{approvedVisits} aprobadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Visitas Completadas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedVisits.length}</div>
              <p className="text-xs text-muted-foreground">De {visits.length} totales</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Evolución de Ventas (6 meses)</CardTitle>
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
              <CardTitle>Distribución de Visitas</CardTitle>
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
                    label={({ name, value }) => `${name}: ${value}`}
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

        {/* Completed Visits with Sales Table */}
        <Card>
          <CardHeader>
            <CardTitle>Visitas Completadas - Últimos 30 Días</CardTitle>
            <CardDescription>Visitas finalizadas con información de ventas asociadas</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha Visita</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Comercial</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Ventas Generadas</TableHead>
                  <TableHead>Comisión Total</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completedVisits.map((visit) => {
                  const totalSalesAmount = visit.sales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
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
                      <TableCell>{visit.company?.name || 'N/A'}</TableCell>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewVisit(visit)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {completedVisits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No hay visitas completadas en los últimos 30 días
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
                  {getStatusBadge(selectedVisit.status, selectedVisit.approval_status)}
                </div>
              </div>

              {selectedVisit.notes && (
                <div>
                  <Label>Notas</Label>
                  <p className="text-sm bg-muted p-2 rounded">{selectedVisit.notes}</p>
                </div>
              )}

              {visitSales.length > 0 && (
                <div>
                  <Label>Ventas Asociadas</Label>
                  <div className="mt-2 space-y-4">
                    {visitSales.map((sale) => (
                      <div key={sale.id} className="border rounded p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">Venta #{sale.id.slice(-8)}</p>
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
                                    <span>{line.product_name}</span>
                                    <span>{formatCurrency(line.line_total || (line.quantity * line.unit_price))}</span>
                                  </div>
                                  <div className="text-muted-foreground">
                                    Cantidad: {line.quantity} × {formatCurrency(line.unit_price)}
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
    </div>
  );
}