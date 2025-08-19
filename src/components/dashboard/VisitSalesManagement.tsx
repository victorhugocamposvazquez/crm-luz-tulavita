import { useState, useEffect, useCallback } from 'react';
import ClientDetailView from './ClientDetailView';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { MapPin, Calendar, DollarSign, Eye, Edit, Trash2, Plus, Loader2, Navigation, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { formatCoordinates } from '@/lib/coordinates';

interface Client {
  id: string;
  nombre_apellidos: string;
  direccion: string;
}

interface Company {
  id: string;
  name: string;
}

interface Visit {
  id: string;
  client_id: string;
  commercial_id: string;
  company_id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  notes?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  created_at: string;
  client?: Client;
}

interface SaleLine {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  paid_cash: boolean;
  is_paid: boolean;
  is_delivered: boolean;
}

interface Sale {
  id: string;
  client_id: string;
  commercial_id: string;
  company_id: string;
  visit_id?: string;
  amount: number;
  commission_percentage: number;
  commission_amount: number;
  sale_date: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  created_at: string;
  client?: Client;
  company?: Company;
  sale_lines?: SaleLine[];
}

const statusLabels = {
  in_progress: 'En Progreso',
  completed: 'Completada',
  no_answer: 'Sin respuesta',
  not_interested: 'No interesado',
  postponed: 'Pospuesta'
};

const statusColors = {
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  no_answer: 'bg-yellow-100 text-yellow-800',
  not_interested: 'bg-red-100 text-red-800',
  postponed: 'bg-blue-100 text-blue-800'
};

export default function VisitSalesManagement() {
  const { user, userRole } = useAuth();
  const { requestLocation } = useGeolocation();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [visitDialogOpen, setVisitDialogOpen] = useState(false);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [activeTab, setActiveTab] = useState('visits');
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ product_name: '', quantity: 1, unit_price: 0, paid_cash: false, is_paid: false, is_delivered: false }]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const isAdmin = userRole?.role === 'admin';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchUserProfile(),
        fetchClients(),
        fetchCompanies(),
        fetchVisits(),
        fetchSales()
      ]);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Error al cargar los datos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return;
    }

    console.log('User profile loaded:', data);
    setUserProfile(data);
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, nombre_apellidos, direccion')
      .order('nombre_apellidos');

    if (error) {
      console.error('Error fetching clients:', error);
      return;
    }

    setClients(data || []);
  };

  const fetchCompanies = async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error fetching companies:', error);
      return;
    }

    setCompanies(data || []);
  };

  const fetchVisits = async () => {
    let query = supabase
      .from('visits')
      .select(`
        *,
        client:clients(id, nombre_apellidos, direccion)
      `)
      .order('visit_date', { ascending: false });

    // Si no es admin, solo mostrar sus propias visitas
    if (!isAdmin && user) {
      query = query.eq('commercial_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching visits:', error);
      return;
    }

    setVisits(data || []);
  };

  const fetchSales = async () => {
    let query = supabase
      .from('sales')
      .select(`
        *,
        client:clients(id, nombre_apellidos, direccion),
        company:companies(id, name)
      `)
      .order('sale_date', { ascending: false });

    // Si no es admin, solo mostrar sus propias ventas
    if (!isAdmin && user) {
      query = query.eq('commercial_id', user.id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching sales:', error);
      return;
    }

    // Obtener líneas de venta para cada venta
    const salesWithLines = await Promise.all((data || []).map(async (sale) => {
      const { data: lines } = await supabase
        .from('sale_lines')
        .select('*')
        .eq('sale_id', sale.id);
      
      return { ...sale, sale_lines: lines || [] };
    }));

    setSales(salesWithLines);
  };

  const handleVisitSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "Usuario no autenticado",
        variant: "destructive",
      });
      return;
    }

    console.log('Creating visit with user profile:', userProfile);

    // Company_id es opcional para las visitas
    const companyId = userProfile?.company_id || null;

    const formData = new FormData(e.currentTarget);
    const clientId = formData.get('client_id') as string;
    const visitDate = formData.get('visit_date') as string;
    const status = formData.get('status') as string;
    const notes = formData.get('notes') as string;

    if (!clientId || !visitDate || !status) {
      toast({
        title: "Error", 
        description: "Por favor completa todos los campos obligatorios",
        variant: "destructive",
      });
      return;
    }

    const visitData = {
      client_id: clientId,
      visit_date: visitDate,
      status: status as 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed',
      notes: notes || null,
      commercial_id: user.id,
      company_id: companyId,
    };

    console.log('Visit data to insert:', visitData);

    // Obtener ubicación si el estado es completada
    let locationData = null;
    if (visitData.status === 'completed') {
      locationData = await requestLocation();
    }

    try {
      let result;
      
      if (editingVisit) {
        const updateData = { ...visitData };
        if (locationData) {
          Object.assign(updateData, {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location_accuracy: locationData.accuracy,
          });
        }
        
        result = await supabase
          .from('visits')
          .update(updateData)
          .eq('id', editingVisit.id);
      } else {
        const insertData = { ...visitData };
        if (locationData) {
          Object.assign(insertData, {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location_accuracy: locationData.accuracy,
          });
        }
        
        result = await supabase
          .from('visits')
          .insert([insertData]);
      }

      if (result.error) {
        throw result.error;
      }

      toast({
        title: "Éxito",
        description: editingVisit ? "Visita actualizada correctamente" : "Visita creada correctamente",
      });

      setVisitDialogOpen(false);
      setEditingVisit(null);
      await fetchVisits();
    } catch (error: any) {
      console.error('Error saving visit:', error);
      toast({
        title: "Error",
        description: error.message || "Error al guardar la visita",
        variant: "destructive",
      });
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Error",
        description: "Usuario no autenticado",
        variant: "destructive",
      });
      return;
    }

    // Validar que al menos haya una línea de producto
    const validLines = saleLines.filter(line => line.product_name.trim() && line.quantity > 0 && line.unit_price > 0);
    if (validLines.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos una línea de producto válida",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData(e.currentTarget);
    const total = validLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
    const commissionAmount = total * 0.05; // 5% fijo

    const saleData = {
      client_id: formData.get('client_id') as string,
      company_id: formData.get('company_id') as string,
      amount: total,
      commission_percentage: 5,
      commission_amount: commissionAmount,
      sale_date: formData.get('sale_date') as string,
      commercial_id: user.id,
    };

    console.log('Attempting to save sale with data:', saleData);
    console.log('User profile:', userProfile);
    console.log('User role:', userRole);

    // Obtener ubicación
    const locationData = await requestLocation();

    try {
      let result;
      
      if (editingSale) {
        const updateData = { ...saleData };
        if (locationData) {
          Object.assign(updateData, {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location_accuracy: locationData.accuracy,
          });
        }
        
        result = await supabase
          .from('sales')
          .update(updateData)
          .eq('id', editingSale.id)
          .select()
          .single();

        if (result.error) throw result.error;

        // Eliminar líneas existentes y crear nuevas
        await supabase
          .from('sale_lines')
          .delete()
          .eq('sale_id', editingSale.id);

        // Insertar nuevas líneas
        const linesData = validLines.map(line => ({
          sale_id: editingSale.id,
          ...line
        }));

        await supabase
          .from('sale_lines')
          .insert(linesData);

      } else {
        const insertData = { ...saleData };
        if (locationData) {
          Object.assign(insertData, {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            location_accuracy: locationData.accuracy,
          });
        }
        
        result = await supabase
          .from('sales')
          .insert([insertData])
          .select()
          .single();

        if (result.error) throw result.error;

        // Insertar líneas de productos
        const linesData = validLines.map(line => ({
          sale_id: result.data.id,
          ...line
        }));

        await supabase
          .from('sale_lines')
          .insert(linesData);
      }

      toast({
        title: "Éxito",
        description: editingSale ? "Venta actualizada correctamente" : "Venta registrada correctamente",
      });

      setSaleDialogOpen(false);
      setEditingSale(null);
      setSaleLines([{ product_name: '', quantity: 1, unit_price: 0, paid_cash: false, is_paid: false, is_delivered: false }]);
      await fetchSales();
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast({
        title: "Error",
        description: error.message || "Error al guardar la venta",
        variant: "destructive",
      });
    }
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta visita?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('visits')
        .delete()
        .eq('id', visitId);

      if (error) {
        throw error;
      }

      toast({
        title: "Éxito",
        description: "Visita eliminada correctamente",
      });

      await fetchVisits();
    } catch (error: any) {
      console.error('Error deleting visit:', error);
      toast({
        title: "Error",
        description: error.message || "Error al eliminar la visita",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSale = async (saleId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta venta?')) {
      return;
    }

    try {
      // Eliminar líneas primero
      await supabase
        .from('sale_lines')
        .delete()
        .eq('sale_id', saleId);

      // Luego eliminar la venta
      const { error } = await supabase
        .from('sales')
        .delete()
        .eq('id', saleId);

      if (error) {
        throw error;
      }

      toast({
        title: "Éxito",
        description: "Venta eliminada correctamente",
      });

      await fetchSales();
    } catch (error: any) {
      console.error('Error deleting sale:', error);
      toast({
        title: "Error",
        description: error.message || "Error al eliminar la venta",
        variant: "destructive",
      });
    }
  };

  const addSaleLine = () => {
    setSaleLines([...saleLines, { product_name: '', quantity: 1, unit_price: 0, paid_cash: false, is_paid: false, is_delivered: false }]);
  };

  const removeSaleLine = (index: number) => {
    if (saleLines.length > 1) {
      setSaleLines(saleLines.filter((_, i) => i !== index));
    }
  };

  const updateSaleLine = (index: number, field: keyof SaleLine, value: any) => {
    const newLines = [...saleLines];
    newLines[index] = { ...newLines[index], [field]: value };
    setSaleLines(newLines);
  };

  const calculateTotal = () => {
    return saleLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  };

  const calculateCommission = () => {
    return calculateTotal() * 0.05; // Default 5% commission
  };

  const openSaleDialog = (sale?: Sale) => {
    if (sale) {
      setEditingSale(sale);
      setSaleLines(sale.sale_lines || [{ product_name: '', quantity: 1, unit_price: 0, paid_cash: false, is_paid: false, is_delivered: false }]);
    } else {
      setEditingSale(null);
      setSaleLines([{ product_name: '', quantity: 1, unit_price: 0, paid_cash: false, is_paid: false, is_delivered: false }]);
    }
    setSaleDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Cargando datos...</span>
      </div>
    );
  }

  if (selectedClientId) {
    return (
      <ClientDetailView 
        clientId={selectedClientId} 
        onBack={() => setSelectedClientId(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Visitas y Ventas</h2>
          <p className="text-muted-foreground">
            Administra las visitas a clientes y registra las ventas {!isAdmin && 'de tu cartera'}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="visits" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Visitas
          </TabsTrigger>
          <TabsTrigger value="sales" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Ventas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestión de visitas</CardTitle>
                <CardDescription>
                  Programa y gestiona las visitas a clientes (solo cuando no hay venta)
                </CardDescription>
              </div>
              <Dialog open={visitDialogOpen} onOpenChange={setVisitDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setEditingVisit(null)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva visita
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingVisit ? 'Editar visita' : 'Programar nueva visita'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleVisitSubmit}>
                    <div className="space-y-4">
                       <div className="space-y-2">
                         <Label htmlFor="client_id">Cliente *</Label>
                         <select name="client_id" defaultValue={editingVisit?.client_id} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                           <option value="">Selecciona un cliente</option>
                           {clients.map((client) => (
                             <option key={client.id} value={client.id}>
                               {client.nombre_apellidos}
                             </option>
                           ))}
                         </select>
                       </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="visit_date">Fecha y Hora *</Label>
                           <Input 
                             name="visit_date" 
                             type="datetime-local"
                             defaultValue={editingVisit?.visit_date ? 
                               new Date(editingVisit.visit_date).toISOString().slice(0, 16) : 
                               new Date().toISOString().slice(0, 16)
                             }
                             required 
                           />
                        </div>
                        
                         <div className="space-y-2">
                           <Label htmlFor="status">Estado *</Label>
                           <select name="status" defaultValue={editingVisit?.status || 'postponed'} required className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                             <option value="postponed">Pospuesta</option>
                             <option value="completed">Completada</option>
                             <option value="no_answer">Sin respuesta</option>
                             <option value="not_interested">No interesado</option>
                           </select>
                         </div>
                      </div>
                      
                       <div className="space-y-2">
                         <Label htmlFor="notes">Notas</Label>
                         <textarea 
                           name="notes" 
                           placeholder="Notas adicionales sobre la visita..."
                           defaultValue={editingVisit?.notes || ''}
                           className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                         />
                       </div>
                    </div>
                    
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setVisitDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">
                        {editingVisit ? 'Actualizar' : 'Crear visita'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visits.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No hay visitas registradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    visits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell className="font-medium">
                          {visit.client?.nombre_apellidos}
                        </TableCell>
                        <TableCell>
                          {format(new Date(visit.visit_date), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[visit.status]}>
                            {statusLabels[visit.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {visit.latitude && visit.longitude ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-4 w-4 text-green-600" />
                              <span className="text-sm text-muted-foreground">Registrada</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin ubicación</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setEditingVisit(visit);
                                setVisitDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteVisit(visit.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Gestión de ventas</CardTitle>
                <CardDescription>
                  Registra y gestiona las ventas realizadas con líneas de productos
                </CardDescription>
              </div>
              <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => openSaleDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                     Nueva venta
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {editingSale ? 'Editar venta' : 'Registrar nueva venta'}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSaleSubmit}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="client_id">Cliente *</Label>
                          <select 
                            name="client_id" 
                            defaultValue={editingSale?.client_id || ''} 
                            required
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Selecciona un cliente</option>
                            {clients.map((client) => (
                              <option key={client.id} value={client.id}>
                                {client.nombre_apellidos}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="company_id">Empresa *</Label>
                          <select 
                            name="company_id" 
                            defaultValue={editingSale?.company_id || ''} 
                            required
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <option value="">Selecciona la empresa</option>
                            {companies.map((company) => (
                              <option key={company.id} value={company.id}>
                                {company.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="sale_date">Fecha de Venta *</Label>
                        <Input 
                          name="sale_date" 
                          type="datetime-local"
                          defaultValue={editingSale?.sale_date ? 
                            new Date(editingSale.sale_date).toISOString().slice(0, 16) : 
                            new Date().toISOString().slice(0, 16)
                          }
                          required 
                        />
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <Label className="text-lg font-semibold">Líneas de Productos</Label>
                          <Button type="button" onClick={addSaleLine} variant="outline" size="sm">
                            <Plus className="h-4 w-4 mr-2" />
                            Añadir línea
                          </Button>
                        </div>
                        
                        <div className="space-y-3">
                          {saleLines.map((line, index) => (
                            <div key={index} className="grid grid-cols-12 gap-3 items-end p-3 border rounded-lg">
                              <div className="col-span-3">
                                <Label className="text-xs">Producto</Label>
                                <Input
                                  placeholder="Nombre del producto"
                                  value={line.product_name}
                                  onChange={(e) => updateSaleLine(index, 'product_name', e.target.value)}
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Unidades</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={line.quantity}
                                  onChange={(e) => updateSaleLine(index, 'quantity', parseInt(e.target.value) || 1)}
                                />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Precio €</Label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={line.unit_price === 0 ? '' : line.unit_price.toString()}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    // Permite solo números y punto decimal
                                    if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                      updateSaleLine(index, 'unit_price', value === '' ? 0 : parseFloat(value) || 0);
                                    }
                                  }}
                                />
                              </div>
                              <div className="col-span-1 text-center">
                                <Label className="text-xs block mb-2">Contado</Label>
                                <Checkbox
                                  checked={line.paid_cash}
                                  onCheckedChange={(checked) => updateSaleLine(index, 'paid_cash', checked)}
                                />
                              </div>
                              <div className="col-span-1 text-center">
                                <Label className="text-xs block mb-2">Pagado</Label>
                                <Checkbox
                                  checked={line.is_paid}
                                  onCheckedChange={(checked) => updateSaleLine(index, 'is_paid', checked)}
                                />
                              </div>
                              <div className="col-span-1 text-center">
                                <Label className="text-xs block mb-2">Entregado</Label>
                                <Checkbox
                                  checked={line.is_delivered}
                                  onCheckedChange={(checked) => updateSaleLine(index, 'is_delivered', checked)}
                                />
                              </div>
                              <div className="col-span-1 text-center">
                                <Label className="text-xs block mb-2">Total</Label>
                                <div className="text-sm font-mono">
                                  €{(line.quantity * line.unit_price).toFixed(2)}
                                </div>
                              </div>
                              <div className="col-span-1">
                                {saleLines.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => removeSaleLine(index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex justify-between text-lg font-semibold">
                            <span>Total de la venta:</span>
                            <span>€{calculateTotal().toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground mt-1">
                            <span>Comisión (5%):</span>
                            <span>€{calculateCommission().toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <DialogFooter className="mt-6">
                      <Button type="button" variant="outline" onClick={() => setSaleDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">
                        {editingSale ? 'Actualizar' : 'Registrar venta'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Importe</TableHead>
                    <TableHead>Comisión (5%)</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Líneas</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No hay ventas registradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    sales.map((sale) => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">
                           <button 
                             onClick={() => setSelectedClientId(sale.client?.id || sale.client_id)}
                             className="text-left hover:text-primary hover:underline transition-colors"
                           >
                             {sale.client?.nombre_apellidos}
                           </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Building2 className="h-4 w-4" />
                            {sale.company?.name}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">
                          €{sale.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="font-mono">
                          €{sale.commission_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {format(new Date(sale.sale_date), "dd/MM/yyyy HH:mm", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {sale.sale_lines?.length || 0} productos
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openSaleDialog(sale)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteSale(sale.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}