import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { toast } from '@/hooks/use-toast';
import { format, subDays, startOfMonth, endOfMonth, eachMonthOfInterval, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Eye } from 'lucide-react';

interface SaleInVisit {
  id: string;
  sale_date: string;
  amount: number;
  commission_percentage: number;
  commission_amount: number;
}

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
  notes: string;
  sales?: SaleInVisit[];
}

export default function CommercialStatistics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlySalesData, setMonthlySalesData] = useState<any[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      fetchStatisticsData();
    }
  }, [user]);

  const fetchStatisticsData = async () => {
    try {
      setLoading(true);
      const thirtyDaysAgo = subDays(new Date(), 30);
      const sixMonthsAgo = subMonths(new Date(), 6);

      // Fetch sales from last 30 days
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          amount,
          commission_percentage,
          commission_amount,
          client:clients(nombre_apellidos, dni),
          company:companies(name)
        `)
        .eq('commercial_id', user.id)
        .gte('sale_date', thirtyDaysAgo.toISOString())
        .order('sale_date', { ascending: false });

      if (salesError) throw salesError;

      // Calculate commission using stored percentage or default to 5%
      const processedSales = salesData?.map(sale => ({
        ...sale,
        commission_amount: sale.commission_amount || (sale.amount * ((sale.commission_percentage || 5) / 100))
      })) || [];

      setSales(processedSales);

      // Fetch visits from last 30 days with associated sales
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select(`
          id,
          visit_date,
          status,
          approval_status,
          notes,
          client_id,
          client:clients(nombre_apellidos, dni),
          company:companies(name)
        `)
        .eq('commercial_id', user.id)
        .gte('visit_date', thirtyDaysAgo.toISOString())
        .order('visit_date', { ascending: false });

      if (visitsError) throw visitsError;

      // For each visit, fetch associated sales
      const visitsWithSales = await Promise.all((visitsData || []).map(async (visit) => {
        const { data: visitSales } = await supabase
          .from('sales')
          .select('id, sale_date, amount, commission_percentage, commission_amount')
          .eq('visit_id', visit.id);

        return {
          ...visit,
          sales: visitSales?.map(sale => ({
            ...sale,
            commission_amount: sale.commission_amount || (sale.amount * ((sale.commission_percentage || 5) / 100))
          })) || []
        };
      }));

      setVisits(visitsWithSales);

      // Fetch monthly sales data for charts
      const { data: monthlySales, error: monthlyError } = await supabase
        .from('sales')
        .select('sale_date, amount')
        .eq('commercial_id', user.id)
        .gte('sale_date', sixMonthsAgo.toISOString())
        .order('sale_date');

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
      console.error('Error fetching statistics:', error);
      toast({
        title: "Error",
        description: "Error al cargar las estadísticas",
        variant: "destructive",
      });
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
      // Fetch sales specifically for this visit
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id, amount, sale_date')
        .eq('visit_id', visitId)
        .order('sale_date', { ascending: false });

      if (salesError) throw salesError;

      // Fetch sale lines for each sale
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
    return <div className="min-h-screen flex items-center justify-center">Cargando estadísticas...</div>;
  }

  const totalSales = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalCommissions = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
  const approvedVisits = visits.filter(visit => visit.approval_status === 'approved').length;
  const pendingVisits = visits.filter(visit => visit.approval_status === 'pending').length;

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

  // Calculate additional statistics
  const completedVisits = visits.filter(visit => visit.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Estadísticas Comercial</h1>
      </div>

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
                <TableHead>Empresa</TableHead>
                <TableHead>Ventas Generadas</TableHead>
                <TableHead>Comisión Total</TableHead>
                <TableHead>Notas</TableHead>
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
                    <TableCell className="max-w-[200px] truncate">
                      {visit.notes || 'Sin notas'}
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
                  <Label>Empresa</Label>
                  <p>{selectedVisit.company.name}</p>
                </div>
                <div>
                  <Label>Fecha</Label>
                  <p>{formatDate(selectedVisit.visit_date)}</p>
                </div>
                <div>
                  <Label>Estado</Label>
                  <div>{getStatusBadge(selectedVisit.status, selectedVisit.approval_status)}</div>
                </div>
              </div>
              
              <div>
                <Label>Notas</Label>
                <p className="mt-1 p-2 border rounded-md bg-muted">
                  {selectedVisit.notes || 'Sin notas'}
                </p>
              </div>

              {/* Resumen de Ventas */}
              <div className="border-t pt-4">
                <Label>Ventas</Label>
                {visitSales.length > 0 ? (
                  <div className="mt-2 space-y-3">
                    <div className="max-h-48 overflow-y-auto">
                      {visitSales.map(sale => (
                        <div key={sale.id} className="border rounded-lg p-3 mb-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{formatCurrency(sale.amount)}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(sale.sale_date).toLocaleDateString('es-ES')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-muted-foreground">
                                {sale.sale_lines?.length || 0} productos
                              </p>
                            </div>
                          </div>
                          {sale.sale_lines && sale.sale_lines.length > 0 && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground">Productos:</p>
                              {sale.sale_lines.slice(0, 3).map((line: any) => (
                                <p key={line.id} className="text-xs">
                                  {line.quantity}x {line.product_name} - {formatCurrency(line.line_total)}
                                </p>
                              ))}
                              {sale.sale_lines.length > 3 && (
                                <p className="text-xs text-muted-foreground">
                                  +{sale.sale_lines.length - 3} productos más
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">No hay ventas registradas para esta visita</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}