import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Calendar, DollarSign, TrendingUp, Building2, Phone, Mail, MapPinIcon, Eye, Euro } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { formatCoordinates } from '@/lib/coordinates';
import VisitsTable from '@/components/visits/VisitsTable';
import VisitDetailsDialog from '@/components/visits/VisitDetailsDialog';
import { calculateCommission } from '@/lib/commission';

interface Client {
  id: string;
  nombre_apellidos: string;
  direccion: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  dni?: string;
  latitude?: number;
  longitude?: number;
}

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  approval_status: 'pending' | 'approved' | 'rejected' | 'waiting_admin';
  notes?: string;
  commercial_id: string;
  company_id?: string | null;
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  company?: {
    name: string;
  } | null;
  created_at: string;
}

interface Sale {
  id: string;
  amount: number;
  commission_amount: number;
  sale_date: string;
  commercial_id: string;
  visit_id?: string;
  company?: {
    name: string;
  } | null;
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  sale_lines?: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
  financiada: boolean;
  transferencia: boolean;
  nulo: boolean;
  }>;
}

const statusLabels = {
  in_progress: 'En Progreso',
  completed: 'Confirmada',
  no_answer: 'Ausente',
  not_interested: 'Sin resultado',
  postponed: 'Oficina'
};

const statusColors = {
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  no_answer: 'bg-yellow-100 text-yellow-800',
  not_interested: 'bg-red-100 text-red-800',
  postponed: 'bg-blue-100 text-blue-800'
};

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

interface ClientDetailViewProps {
  clientId: string;
  onBack: () => void;
}

export default function ClientDetailView({ clientId, onBack }: ClientDetailViewProps) {
  const { userRole } = useAuth();
  
  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [visitSales, setVisitSales] = useState<any[]>([]);

  const isAdmin = userRole?.role === 'admin';

  useEffect(() => {
    if (clientId) {
      fetchClientData();
    }
  }, [clientId]);

  const fetchClientData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchClient(),
        fetchVisits(),
        fetchSales()
      ]);
    } catch (error) {
      console.error('Error fetching client data:', error);
      toast({
        title: "Error",
        description: "Error al cargar los datos del cliente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchClient = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();

    if (error) {
      console.error('Error fetching client:', error);
      toast({
        title: "Error",
        description: "Cliente no encontrado",
        variant: "destructive",
      });
      return;
    }

    setClient(data);
  };

const fetchVisits = async () => {
  // Fetch visits first
  const { data, error } = await supabase
    .from('visits')
    .select(`
      *,
      visit_states (
        name,
        description
      )
    `)
    .eq('client_id', clientId)
    .order('visit_date', { ascending: false });

  if (error) {
    console.error('Error fetching visits:', error);
    return;
  }

  const visitsData = data || [];

  // Batch-load related profiles (commercials) and companies to avoid N+1
  const commercialIds = Array.from(new Set(
    visitsData.map(v => v.commercial_id).filter(Boolean)
  ));
  const companyIds = Array.from(new Set(
    visitsData.map(v => (v as any).company_id).filter(Boolean)
  ));

  const [{ data: profiles }, { data: companies }] = await Promise.all([
    commercialIds.length
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', commercialIds)
      : Promise.resolve({ data: [], error: null } as any),
    companyIds.length
      ? supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));
  const companyMap = new Map((companies || []).map(c => [c.id, c]));

  const enriched = visitsData.map(v => ({
    ...v,
    commercial: profileMap.get(v.commercial_id) || null,
    company: companyMap.get((v as any).company_id) || null,
  }));

  setVisits(enriched as any);
};

  const fetchSales = async () => {
    let query = supabase
      .from('sales')
      .select(`
        *,
        company:companies(name)
      `)
      .eq('client_id', clientId)
      .order('sale_date', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching sales:', error);
      return;
    }

    // Obtener líneas de venta y comerciales para cada venta
    const salesWithLines = await Promise.all((data || []).map(async (sale) => {
      const [{ data: lines }, { data: commercial }] = await Promise.all([
        supabase
          .from('sale_lines')
          .select('*')
          .eq('sale_id', sale.id),
        supabase
          .from('profiles')
          .select('first_name, last_name, email')
          .eq('id', sale.commercial_id)
          .maybeSingle()
      ]);
      
      // Calculate commission using the new system
      const commissionPercentage = sale.commission_percentage || 0;
      const calculatedCommission = sale.commission_amount || calculateCommission(sale.amount);
      
      return { 
        ...sale, 
        sale_lines: lines || [], 
        commercial,
        commission_amount: calculatedCommission
      };
    }));

    setSales(salesWithLines as unknown as Sale[]);
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
      const salesWithLines = await Promise.all((salesData || []).map(async (sale) => {
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

  // Estadísticas calculadas
  const totalSales = sales.reduce((sum, sale) => sum + sale.amount, 0);
  const totalCommissions = sales.reduce((sum, sale) => sum + sale.commission_amount, 0);
  const averageSale = sales.length > 0 ? totalSales / sales.length : 0;
  const totalProducts = sales.reduce((sum, sale) => sum + (sale.sale_lines?.length || 0), 0);

  // Datos para gráficas
  const visitStatusData = Object.entries(
    visits.reduce((acc, visit) => {
      // Priority: show rejection status first
      if (visit.approval_status === 'rejected') {
        acc['rejected'] = (acc['rejected'] || 0) + 1;
      } else {
        acc[visit.status] = (acc[visit.status] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>)
  ).map(([status, count]) => ({
    name: status === 'rejected' ? 'Rechazada' : statusLabels[status as keyof typeof statusLabels] || status,
    value: count,
    status
  }));

  const monthlySalesData = sales.reduce((acc, sale) => {
    const month = format(new Date(sale.sale_date), 'yyyy-MM');
    const existing = acc.find(item => item.month === month);
    if (existing) {
      existing.amount += sale.amount;
      existing.count += 1;
    } else {
      acc.push({
        month,
        monthLabel: format(new Date(sale.sale_date), 'MMM yyyy', { locale: es }),
        amount: sale.amount,
        count: 1
      });
    }
    return acc;
  }, [] as Array<{ month: string; monthLabel: string; amount: number; count: number }>)
  .sort((a, b) => a.month.localeCompare(b.month));

  const productData = sales.flatMap(sale => sale.sale_lines || [])
    .reduce((acc, line) => {
      const existing = acc.find(item => item.name === line.product_name);
      if (existing) {
        existing.quantity += line.quantity;
        existing.revenue += line.quantity * line.unit_price;
      } else {
        acc.push({
          name: line.product_name,
          quantity: line.quantity,
          revenue: line.quantity * line.unit_price
        });
      }
      return acc;
    }, [] as Array<{ name: string; quantity: number; revenue: number }>)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">Cargando datos del cliente...</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Cliente no encontrado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header con información del cliente */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="outline" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground">{client.nombre_apellidos}</h1>
          <p className="text-muted-foreground">Detalle completo del cliente</p>
        </div>
      </div>

      {/* Información básica del cliente */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-3 text-xl">
            <Building2 className="h-6 w-6" />
            Información del cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
              <MapPinIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <a 
                href={`https://maps.google.com/?q=${encodeURIComponent(client.direccion)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline flex items-center gap-1"
              >
                {client.direccion}
                <MapPinIcon className="h-3 w-3" />
              </a>
            </div>
            {client.latitude && client.longitude && (
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <a 
                  href={`https://maps.google.com/?q=${client.latitude},${client.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline flex items-center gap-1"
                >
                  {formatCoordinates(client.latitude, client.longitude)}
                  <MapPinIcon className="h-3 w-3" />
                </a>
              </div>
            )}
            {client.telefono1 && (
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{client.telefono1}</span>
              </div>
            )}
            {client.telefono2 && (
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                <Phone className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{client.telefono2}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm">{client.email}</span>
              </div>
            )}
            {client.dni && (
              <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border">
                <span className="text-sm font-medium flex-shrink-0">DNI:</span>
                <span className="text-sm">{client.dni}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Métricas resumidas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total ventas</p>
                <p className="text-2xl font-bold text-green-600">€{totalSales.toFixed(2)}</p>
              </div>
              <Euro className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Número de Ventas</p>
                <p className="text-2xl font-bold text-blue-600">{sales.length}</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Venta Promedio</p>
                <p className="text-2xl font-bold text-purple-600">€{averageSale.toFixed(2)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Visitas</p>
                <p className="text-2xl font-bold text-orange-600">{visits.length}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas */}
      {(monthlySalesData.length > 0 || visitStatusData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Gráfica de ventas mensuales */}
          {monthlySalesData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Ventas por mes</CardTitle>
                <CardDescription>Evolución de las ventas a lo largo del tiempo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlySalesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="monthLabel" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`€${Number(value).toFixed(2)}`, 'Importe']} />
                      <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Estado de visitas */}
          {visitStatusData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Estado de visitas</CardTitle>
                <CardDescription>Distribución por estado de las visitas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        dataKey="value"
                        data={visitStatusData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {visitStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Productos vendidos con coste */}
          {productData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Productos vendidos</CardTitle>
                <CardDescription>Productos vendidos con su coste total</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {productData.map((product, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="font-medium">{product.name}</p>
                        <p className="text-sm text-muted-foreground">Cantidad: {product.quantity}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600">€{product.revenue.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Métricas adicionales */}
          <Card>
            <CardHeader>
              <CardTitle>Estadísticas adicionales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Comisiones Generadas:</span>
                <span className="font-bold text-green-600">€{totalCommissions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Productos Vendidos:</span>
                <span className="font-bold">{totalProducts}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Visitas Completadas:</span>
                <span className="font-bold text-green-600">
                  {visits.filter(v => v.status === 'completed').length}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Tasa de Conversión:</span>
                <span className="font-bold text-blue-600">
                  {visits.length > 0 ? ((sales.length / visits.length) * 100).toFixed(1) + '%' : '0%'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detalles de visitas */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Historial de visitas</CardTitle>
            <CardDescription>Todas las visitas realizadas a este cliente</CardDescription>
          </CardHeader>
          <CardContent>
            <VisitsTable
              visits={visits as any}
              sales={sales}
              onViewVisit={handleViewVisit as any}
              loading={loading}
              showClientColumns={false}
              emptyMessage="No hay visitas registradas para este cliente"
            />
          </CardContent>
        </Card>
      </div>

      {/* Visit Detail Dialog */}
      <VisitDetailsDialog
        selectedVisit={selectedVisit}
        visitSales={visitSales}
        onClose={() => setSelectedVisit(null)}
        showClientInfo={false}
      />
    </div>
  );
}