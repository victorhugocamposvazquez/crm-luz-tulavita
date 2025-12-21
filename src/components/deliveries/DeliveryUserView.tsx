import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Truck, User, MapPin, Calendar, FileText, DollarSign, Plus, Loader2, Eye, Play, CheckCircle, Filter, X, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Delivery {
  id: string;
  visit_id: string;
  delivery_id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
  created_at: string;
  visit?: {
    id: string;
    visit_date: string;
    status: string;
    notes?: string;
    client_id: string;
    company_id: string;
    client?: {
      id: string;
      nombre_apellidos: string;
      direccion: string;
      dni?: string;
      telefono1?: string;
    };
  };
}

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  commission_amount: number;
  sale_lines?: SaleLine[];
}

interface SaleLine {
  id?: string;
  products: { product_name: string }[];
  quantity: number;
  unit_price: number;
  financiada: boolean;
  transferencia: boolean;
  nulo: boolean;
}

interface VisitHistory {
  id: string;
  recorded_at: string;
  note?: string;
  visit_state_code?: string;
  commercial?: {
    first_name: string;
    last_name: string;
  };
}

export default function DeliveryUserView() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistory[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [addSaleDialogOpen, setAddSaleDialogOpen] = useState(false);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ products: [{ product_name: '' }], quantity: 1, unit_price: 0, financiada: false, transferencia: false, nulo: false }]);
  const [savingSale, setSavingSale] = useState(false);
  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [filters, setFilters] = useState({
    client: '',
    dni: '',
    startDate: '',
    status: 'all'
  });

  const fetchDeliveries = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('delivery_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const visitIds = [...new Set((data || []).map(d => d.visit_id))];
      const visitsMap = new Map();

      if (visitIds.length > 0) {
        const { data: visitsData } = await supabase
          .from('visits')
          .select(`
            id, visit_date, status, notes, client_id, company_id,
            client:clients(id, nombre_apellidos, direccion, dni, telefono1)
          `)
          .in('id', visitIds);

        (visitsData || []).forEach(v => {
          visitsMap.set(v.id, v);
        });
      }

      let transformedDeliveries: Delivery[] = (data || []).map((item) => ({
        ...item,
        status: item.status as 'pending' | 'in_progress' | 'completed' | 'cancelled',
        visit: visitsMap.get(item.visit_id)
      }));

      setDeliveries(transformedDeliveries);
    } catch (error: any) {
      console.error('Error fetching deliveries:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los repartos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchDeliveries();

    const channel = supabase
      .channel('delivery-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_notifications',
          filter: `user_id=eq.${user?.id}`
        },
        async (payload) => {
          fetchDeliveries();
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            await (supabase as any)
              .from('delivery_notifications')
              .delete()
              .eq('id', (payload.new as any).id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeliveries, user?.id]);

  const fetchDeliveryDetails = async (delivery: Delivery) => {
    if (!delivery.visit_id) return;

    setLoadingDetail(true);
    try {
      const { data: salesData } = await supabase
        .from('sales')
        .select('id, amount, sale_date, commission_amount')
        .eq('visit_id', delivery.visit_id);

      const salesWithLines = await Promise.all((salesData || []).map(async (sale) => {
        const { data: lines } = await supabase
          .from('sale_lines')
          .select(`
            id, quantity, unit_price, financiada, transferencia, nulo,
            sale_lines_products(product_name)
          `)
          .eq('sale_id', sale.id);

        return {
          ...sale,
          sale_lines: (lines || []).map(line => ({
            id: line.id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            financiada: line.financiada,
            transferencia: line.transferencia,
            nulo: line.nulo,
            products: line.sale_lines_products || []
          }))
        };
      }));

      setSales(salesWithLines);

      const { data: historyData } = await supabase
        .from('visit_progress_history')
        .select('id, recorded_at, note, visit_state_code, commercial_id')
        .eq('visit_id', delivery.visit_id)
        .order('recorded_at', { ascending: false });

      const commercialIds = [...new Set((historyData || []).map(h => h.commercial_id))];
      const commercialsMap = new Map();

      if (commercialIds.length > 0) {
        const { data: commercialsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', commercialIds);

        (commercialsData || []).forEach(c => commercialsMap.set(c.id, c));
      }

      setVisitHistory((historyData || []).map(h => ({
        ...h,
        commercial: commercialsMap.get(h.commercial_id)
      })));
    } catch (error) {
      console.error('Error fetching delivery details:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleViewDetail = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    fetchDeliveryDetails(delivery);
    setDetailDialogOpen(true);
  };

  const handleStartDelivery = async (delivery: Delivery) => {
    try {
      const { error } = await supabase
        .from('deliveries')
        .update({ status: 'in_progress' })
        .eq('id', delivery.id);

      if (error) throw error;

      toast({
        title: "Reparto iniciado",
        description: "El reparto ha sido marcado como en progreso",
      });

      fetchDeliveries();
      if (selectedDelivery?.id === delivery.id) {
        setSelectedDelivery({ ...delivery, status: 'in_progress' });
      }
    } catch (error: any) {
      console.error('Error starting delivery:', error);
      toast({
        title: "Error",
        description: "No se pudo iniciar el reparto",
        variant: "destructive",
      });
    }
  };

  const handleCompleteDelivery = async (delivery: Delivery) => {
    if (!confirm('¿Estás seguro de que quieres marcar este reparto como completado?')) return;

    try {
      const { error: deliveryError } = await supabase
        .from('deliveries')
        .update({ status: 'completed' })
        .eq('id', delivery.id);

      if (deliveryError) throw deliveryError;

      if (delivery.visit_id) {
        await supabase
          .from('visits')
          .update({ status: 'completed' })
          .eq('id', delivery.visit_id);
      }

      toast({
        title: "Reparto completado",
        description: "El reparto ha sido marcado como completado",
      });

      fetchDeliveries();
      setDetailDialogOpen(false);
    } catch (error: any) {
      console.error('Error completing delivery:', error);
      toast({
        title: "Error",
        description: "No se pudo completar el reparto",
        variant: "destructive",
      });
    }
  };

  const handleReopenDelivery = async (delivery: Delivery) => {
    if (!confirm('¿Estás seguro de que quieres reabrir este reparto?')) return;

    try {
      const { error: deliveryError } = await supabase
        .from('deliveries')
        .update({ status: 'in_progress' })
        .eq('id', delivery.id);

      if (deliveryError) throw deliveryError;

      if (delivery.visit_id) {
        await supabase
          .from('visits')
          .update({ status: 'in_progress' })
          .eq('id', delivery.visit_id);
      }

      toast({
        title: "Reparto reabierto",
        description: "El reparto ha sido reabierto y está en progreso",
      });

      fetchDeliveries();
      if (selectedDelivery?.id === delivery.id) {
        setSelectedDelivery({ ...delivery, status: 'in_progress' });
      }
    } catch (error: any) {
      console.error('Error reopening delivery:', error);
      toast({
        title: "Error",
        description: "No se pudo reabrir el reparto",
        variant: "destructive",
      });
    }
  };

  const handleOpenAddSale = () => {
    setSaleLines([{ products: [{ product_name: '' }], quantity: 1, unit_price: 0, financiada: false, transferencia: false, nulo: false }]);
    setAddSaleDialogOpen(true);
  };

  const addSaleLine = () => {
    setSaleLines([...saleLines, { products: [{ product_name: '' }], quantity: 1, unit_price: 0, financiada: false, transferencia: false, nulo: false }]);
  };

  const removeSaleLine = (index: number) => {
    if (saleLines.length > 1) {
      setSaleLines(saleLines.filter((_, i) => i !== index));
    }
  };

  const updateSaleLine = (index: number, field: keyof SaleLine, value: any) => {
    const newLines = [...saleLines];
    (newLines[index] as any)[field] = value;
    setSaleLines(newLines);
  };

  const updateProductName = (lineIndex: number, productIndex: number, value: string) => {
    const newLines = [...saleLines];
    newLines[lineIndex].products[productIndex] = { product_name: value };
    setSaleLines(newLines);
  };

  const calculateTotal = () => {
    return saleLines
      .filter(line => !line.nulo)
      .reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  };

  const handleSaveSale = async () => {
    if (!selectedDelivery?.visit || !user) return;

    const validLines = saleLines.filter(line => 
      line.products.some(p => p.product_name.trim()) && 
      line.quantity > 0 && 
      line.unit_price >= 0
    );

    if (validLines.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos una línea de producto válida",
        variant: "destructive",
      });
      return;
    }

    setSavingSale(true);
    try {
      const total = calculateTotal();

      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          visit_id: selectedDelivery.visit_id,
          client_id: selectedDelivery.visit.client_id,
          commercial_id: user.id,
          company_id: selectedDelivery.visit.company_id,
          amount: total,
          commission_percentage: 0,
          commission_amount: 0,
          sale_date: new Date().toISOString()
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const linesData = validLines.map(line => ({
        sale_id: saleData.id,
        quantity: line.quantity,
        unit_price: line.unit_price,
        financiada: line.financiada,
        transferencia: line.transferencia,
        nulo: line.nulo
      }));

      const { data: linesResult, error: linesError } = await supabase
        .from('sale_lines')
        .insert(linesData)
        .select();

      if (linesError) throw linesError;

      const productsData = (linesResult || []).flatMap((insertedLine, index) => 
        validLines[index].products
          .filter(p => p.product_name.trim())
          .map(product => ({
            sale_line_id: insertedLine.id,
            product_name: product.product_name
          }))
      );

      if (productsData.length > 0) {
        const { error: productsError } = await supabase
          .from('sale_lines_products')
          .insert(productsData);

        if (productsError) throw productsError;
      }

      toast({
        title: "Venta registrada",
        description: "La venta ha sido añadida correctamente",
      });

      setAddSaleDialogOpen(false);
      fetchDeliveryDetails(selectedDelivery);
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la venta",
        variant: "destructive",
      });
    } finally {
      setSavingSale(false);
    }
  };

  const handleOpenAddNote = () => {
    setNewNote('');
    setAddNoteDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!selectedDelivery?.visit_id || !user || !newNote.trim()) return;

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('visit_progress_history')
        .insert({
          visit_id: selectedDelivery.visit_id,
          commercial_id: user.id,
          note: newNote.trim(),
          recorded_at: new Date().toISOString()
        });

      if (error) throw error;

      const currentNotes = selectedDelivery.visit?.notes || '';
      const updatedNotes = currentNotes 
        ? `${currentNotes}\n\n[${format(new Date(), 'dd/MM/yyyy HH:mm')}] ${newNote.trim()}`
        : `[${format(new Date(), 'dd/MM/yyyy HH:mm')}] ${newNote.trim()}`;

      await supabase
        .from('visits')
        .update({ notes: updatedNotes })
        .eq('id', selectedDelivery.visit_id);

      toast({
        title: "Nota añadida",
        description: "La nota ha sido registrada correctamente",
      });

      setAddNoteDialogOpen(false);
      fetchDeliveryDetails(selectedDelivery);
    } catch (error: any) {
      console.error('Error saving note:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la nota",
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completado';
      case 'cancelled':
        return 'Cancelado';
      case 'in_progress':
        return 'En Progreso';
      default:
        return 'Pendiente';
    }
  };

  const hasActiveFilters = Object.entries(filters).some(([key, value]) => 
    key === 'status' ? value !== 'all' : value.trim() !== ''
  );

  const clearFilters = () => {
    setFilters({
      client: '',
      dni: '',
      startDate: '',
      status: 'all'
    });
  };

  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    if (filters.client && !delivery.visit?.client?.nombre_apellidos?.toLowerCase().includes(filters.client.toLowerCase())) {
      return false;
    }
    if (filters.dni && !delivery.visit?.client?.dni?.toLowerCase().includes(filters.dni.toLowerCase())) {
      return false;
    }
    if (filters.startDate && delivery.visit?.visit_date) {
      const visitDate = new Date(delivery.visit.visit_date).toISOString().split('T')[0];
      if (visitDate < filters.startDate) return false;
    }
    if (filters.status !== 'all' && delivery.status !== filters.status) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis Repartos</h1>
          <p className="text-muted-foreground">Gestiona los repartos asignados</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros
            </div>
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 w-8 p-0" title="Limpiar filtros">
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="client">Cliente</Label>
              <Input
                id="client"
                placeholder="Nombre del cliente..."
                value={filters.client}
                onChange={(e) => updateFilter('client', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dni">DNI</Label>
              <Input
                id="dni"
                placeholder="DNI del cliente..."
                value={filters.dni}
                onChange={(e) => updateFilter('dni', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="startDate">Fecha Visita</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) => updateFilter('startDate', e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-background">
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="in_progress">En Progreso</SelectItem>
                  <SelectItem value="completed">Completados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de repartos ({filteredDeliveries.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Cargando repartos...</span>
            </div>
          ) : filteredDeliveries.length === 0 ? (
            <div className="text-center py-8">
              <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No se encontraron repartos con los filtros aplicados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>DNI</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Fecha Visita</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="font-medium">
                      {delivery.visit?.client?.nombre_apellidos || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {delivery.visit?.client?.dni || 'N/A'}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {delivery.visit?.client?.direccion || 'N/A'}
                    </TableCell>
                    <TableCell>
                      {delivery.visit?.visit_date ? 
                        format(new Date(delivery.visit.visit_date), 'dd/MM/yyyy', { locale: es }) : 
                        'N/A'
                      }
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(delivery.status)}>
                        {getStatusLabel(delivery.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleViewDetail(delivery)}
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {delivery.status === 'pending' && (
                          <Button 
                            size="sm"
                            onClick={() => handleStartDelivery(delivery)}
                            title="Iniciar reparto"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {delivery.status === 'in_progress' && (
                          <Button 
                            size="sm" 
                            variant="default"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => handleCompleteDelivery(delivery)}
                            title="Completar reparto"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {delivery.status === 'completed' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReopenDelivery(delivery)}
                            title="Reabrir reparto"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalle del Reparto
              {selectedDelivery && (
                <Badge className={getStatusColor(selectedDelivery.status)}>
                  {getStatusLabel(selectedDelivery.status)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-4">
            {selectedDelivery && (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Nombre</p>
                        <p className="font-medium">{selectedDelivery.visit?.client?.nombre_apellidos || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Teléfono</p>
                        <p className="font-medium">{selectedDelivery.visit?.client?.telefono1 || 'N/A'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Dirección</p>
                      <p className="font-medium flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        {selectedDelivery.visit?.client?.direccion || 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Notas
                      </span>
                      <Button size="sm" variant="outline" onClick={handleOpenAddNote}>
                        <Plus className="h-4 w-4 mr-1" />
                        Añadir Nota
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedDelivery.visit?.notes ? (
                      <p className="whitespace-pre-wrap text-sm">{selectedDelivery.visit.notes}</p>
                    ) : (
                      <p className="text-muted-foreground text-sm">Sin notas</p>
                    )}
                  </CardContent>
                </Card>

                {visitHistory.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Histórico ({visitHistory.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {visitHistory.map((history) => (
                          <div key={history.id} className="border-l-2 border-primary pl-4 py-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">
                                {history.commercial ? 
                                  `${history.commercial.first_name} ${history.commercial.last_name}` : 
                                  'Usuario'
                                }
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(history.recorded_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                              </p>
                            </div>
                            {history.note && (
                              <p className="text-sm text-muted-foreground mt-1">{history.note}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5" />
                        Ventas ({sales.length})
                      </span>
                      <Button size="sm" onClick={handleOpenAddSale}>
                        <Plus className="h-4 w-4 mr-1" />
                        Añadir Venta
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loadingDetail ? (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : sales.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">No hay ventas registradas</p>
                    ) : (
                      <div className="space-y-4">
                        {sales.map((sale, saleIndex) => (
                          <div key={sale.id} className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <p className="font-bold text-lg">Venta #{saleIndex + 1}</p>
                                <p className="text-sm text-muted-foreground">
                                  {format(new Date(sale.sale_date), 'dd/MM/yyyy HH:mm', { locale: es })}
                                </p>
                              </div>
                              <p className="font-bold text-lg text-green-600">{sale.amount.toFixed(2).replace('.', ',')} €</p>
                            </div>
                            
                            {sale.sale_lines && sale.sale_lines.length > 0 && (
                              <>
                                <p className="font-semibold mt-4 mb-2">Productos:</p>
                                <div className="space-y-3">
                                  {sale.sale_lines.map((line, idx) => (
                                    <div key={idx} className="bg-muted/30 rounded-lg p-3">
                                      <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                          <p className="font-medium">
                                            {line.quantity}x {line.products[0]?.product_name || 'Pack'} - {line.unit_price.toFixed(2).replace('.', ',')} €
                                          </p>
                                          {line.products.length > 1 && (
                                            <div className="mt-1 ml-4 text-sm text-muted-foreground">
                                              {line.products.slice(1).map((p, pIdx) => (
                                                <p key={pIdx}>• {p.product_name}</p>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <p className="font-medium">{(line.quantity * line.unit_price).toFixed(2).replace('.', ',')} €</p>
                                      </div>
                                      <div className="flex gap-2 mt-2">
                                        <Badge 
                                          variant={line.financiada ? "default" : "outline"} 
                                          className={line.financiada ? "bg-gray-200 text-gray-800 hover:bg-gray-200" : ""}
                                        >
                                          {line.financiada ? '✓' : '✗'} Financiada
                                        </Badge>
                                        <Badge 
                                          variant={line.transferencia ? "default" : "outline"}
                                          className={line.transferencia ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                                        >
                                          {line.transferencia ? '✓' : '✗'} Transferencia
                                        </Badge>
                                        <Badge 
                                          variant={line.nulo ? "destructive" : "outline"}
                                        >
                                          {line.nulo ? '✓' : '✗'} Nulo
                                        </Badge>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {selectedDelivery.status === 'in_progress' && (
                  <div className="flex justify-end">
                    <Button 
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleCompleteDelivery(selectedDelivery)}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Completar Reparto
                    </Button>
                  </div>
                )}
                {selectedDelivery.status === 'completed' && (
                  <div className="flex justify-end">
                    <Button 
                      variant="outline"
                      onClick={() => handleReopenDelivery(selectedDelivery)}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Reabrir Reparto
                    </Button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={addSaleDialogOpen} onOpenChange={setAddSaleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Añadir Venta</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {saleLines.map((line, index) => (
              <Card key={index}>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div>
                      <Label>Producto</Label>
                      <Input
                        value={line.products[0]?.product_name || ''}
                        onChange={(e) => updateProductName(index, 0, e.target.value)}
                        placeholder="Nombre del producto"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Cantidad</Label>
                        <Input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => updateSaleLine(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <Label>Precio Unitario (€)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price || ''}
                          onChange={(e) => updateSaleLine(index, 'unit_price', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={line.financiada}
                          onCheckedChange={(checked) => updateSaleLine(index, 'financiada', checked)}
                        />
                        <Label>Financiada</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={line.transferencia}
                          onCheckedChange={(checked) => updateSaleLine(index, 'transferencia', checked)}
                        />
                        <Label>Transferencia</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={line.nulo}
                          onCheckedChange={(checked) => updateSaleLine(index, 'nulo', checked)}
                        />
                        <Label>Nulo</Label>
                      </div>
                    </div>
                    {saleLines.length > 1 && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => removeSaleLine(index)}
                        className="text-red-600"
                      >
                        Eliminar línea
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button variant="outline" onClick={addSaleLine} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Añadir línea
            </Button>

            <div className="flex justify-between items-center p-4 bg-muted rounded-lg">
              <span className="font-medium">Total:</span>
              <span className="text-xl font-bold">{calculateTotal().toFixed(2)} €</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSaleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveSale} disabled={savingSale}>
              {savingSale ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar Venta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addNoteDialogOpen} onOpenChange={setAddNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir Nota</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Escribe tu nota aquí..."
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddNoteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNote} disabled={savingNote || !newNote.trim()}>
              {savingNote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar Nota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
