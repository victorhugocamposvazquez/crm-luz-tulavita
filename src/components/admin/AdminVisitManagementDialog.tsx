import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Trash2, Plus, Minus, Save, AlertTriangle } from 'lucide-react';

interface Visit {
  id: string;
  visit_date: string;
  status: string;
  notes?: string;
  client_id: string;
  commercial_id: string;
  second_commercial_id?: string;
  visit_state_code?: string;
  client?: {
    id: string;
    nombre_apellidos: string;
    dni?: string;
  };
  commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  second_commercial?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
  visit_states?: {
    name: string;
    description?: string;
  };
}

interface Sale {
  id: string;
  amount: number;
  commission_amount: number;
  visit_id: string;
  client_id: string;
  commercial_id: string;
  company_id: string;
  sale_lines?: SaleLine[];
}

interface SaleLine {
  id: string;
  sale_id: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
  financiada: boolean;
  transferencia: boolean;
  nulo: boolean;
  sale_lines_products?: SaleLineProduct[];
}

interface SaleLineProduct {
  id: string;
  sale_line_id: string;
  product_name: string;
}

interface Client {
  id: string;
  nombre_apellidos: string;
  dni?: string;
  direccion: string;
}

interface Commercial {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AdminVisitManagementDialogProps {
  visit: Visit | null;
  isOpen: boolean;
  onClose: () => void;
  onVisitUpdated: () => void;
}

const statusLabels = {
  in_progress: 'En progreso',
  completed: 'Confirmada',
  no_answer: 'Ausente',
  not_interested: 'Sin resultado',
  postponed: 'Oficina'
};

export default function AdminVisitManagementDialog({ 
  visit, 
  isOpen, 
  onClose, 
  onVisitUpdated 
}: AdminVisitManagementDialogProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  
  // Basic info state
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [visitStateCode, setVisitStateCode] = useState('');
  
  // Client change state
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  
  // Commercial change state
  const [selectedCommercialId, setSelectedCommercialId] = useState('');
  const [selectedSecondCommercialId, setSelectedSecondCommercialId] = useState('');
  const [commercials, setCommercials] = useState<Commercial[]>([]);
  
  // Sales management state
  const [sales, setSales] = useState<Sale[]>([]);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  
  // Visit states
  const [visitStates, setVisitStates] = useState<Array<{code: string, name: string}>>([]);

  useEffect(() => {
    if (visit && isOpen) {
      // Initialize basic info
      setNotes(visit.notes || '');
      setStatus(visit.status);
      setVisitStateCode(visit.visit_state_code || 'none');
      setSelectedClientId(visit.client_id);
      setSelectedCommercialId(visit.commercial_id);
      setSelectedSecondCommercialId(visit?.second_commercial_id || '');
      
      fetchClients();
      fetchCommercials();
      fetchSales();
      fetchVisitStates();
    }
  }, [visit, isOpen]);

  const fetchCommercials = async () => {
    try {
      // First get user_roles with role 'commercial'
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'commercial');
      
      if (roleError) throw roleError;
      
      if (userRoles && userRoles.length > 0) {
        const userIds = userRoles.map(ur => ur.user_id);
        
        // Then get profiles for these users
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds)
          .order('first_name');
        
        if (profileError) throw profileError;
        setCommercials(profiles || []);
      }
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, nombre_apellidos, dni, direccion')
        .eq('status', 'active')
        .order('nombre_apellidos');
      
      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchSales = async () => {
    if (!visit) return;
    
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          sale_lines (
            *,
            sale_lines_products (*)
          )
        `)
        .eq('visit_id', visit.id);
      
      if (error) throw error;
      setSales(data || []);
    } catch (error) {
      console.error('Error fetching sales:', error);
    }
  };

  const fetchVisitStates = async () => {
    try {
      const { data, error } = await supabase
        .from('visit_states')
        .select('code, name')
        .order('name');
      
      if (error) throw error;
      setVisitStates(data || []);
    } catch (error) {
      console.error('Error fetching visit states:', error);
    }
  };

  const handleDeleteVisit = async () => {
    if (!visit) return;
    
    const confirmed = confirm(
      '¿Estás seguro de que quieres eliminar esta visita? ' +
      'Esta acción eliminará la visita y todas las ventas asociadas permanentemente.'
    );
    
    if (!confirmed) return;
    
    setLoading(true);
    try {
      // Delete sales first (cascade should handle this, but being explicit)
      const { error: salesError } = await supabase
        .from('sales')
        .delete()
        .eq('visit_id', visit.id);
      
      if (salesError) throw salesError;
      
      // Delete visit
      const { error: visitError } = await supabase
        .from('visits')
        .delete()
        .eq('id', visit.id);
      
      if (visitError) throw visitError;
      
      toast({
        title: "Visita eliminada",
        description: "La visita y todas sus ventas han sido eliminadas exitosamente",
      });
      
      onVisitUpdated();
      onClose();
    } catch (error: any) {
      console.error('Error deleting visit:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la visita",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBasicInfo = async () => {
    if (!visit) return;
    
    setLoading(true);
    try {
      const updateData: { 
        notes: string; 
        status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed'; 
        visit_state_code?: string; 
        client_id?: string; 
        commercial_id?: string; 
        second_commercial_id?: string | null;
      } = {
        notes,
        status: status as 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed',
      };
      
      if (visitStateCode && visitStateCode !== 'none') {
        updateData.visit_state_code = visitStateCode;
      }
      
      if (selectedClientId !== visit.client_id) {
        updateData.client_id = selectedClientId;
      }
      
      if (selectedCommercialId !== visit.commercial_id) {
        updateData.commercial_id = selectedCommercialId;
      }
      
      if (selectedSecondCommercialId !== (visit.second_commercial_id || '')) {
        updateData.second_commercial_id = selectedSecondCommercialId || null;
      }
      
      const { error } = await supabase
        .from('visits')
        .update(updateData)
        .eq('id', visit.id);
      
      if (error) throw error;
      
      // If client changed, update all sales to new client
      if (selectedClientId !== visit.client_id) {
        const { error: salesUpdateError } = await supabase
          .from('sales')
          .update({ client_id: selectedClientId })
          .eq('visit_id', visit.id);
        
        if (salesUpdateError) throw salesUpdateError;
      }
      
      // If commercial changed, update all sales to new commercial
      if (selectedCommercialId !== visit.commercial_id) {
        const { error: salesCommercialUpdateError } = await supabase
          .from('sales')
          .update({ commercial_id: selectedCommercialId })
          .eq('visit_id', visit.id);
        
        if (salesCommercialUpdateError) throw salesCommercialUpdateError;
      }
      
      toast({
        title: "Visita actualizada",
        description: "Los datos básicos de la visita han sido actualizados",
      });
      
      onVisitUpdated();
    } catch (error: any) {
      console.error('Error updating visit:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la visita",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditSale = (sale: Sale) => {
    setEditingSale(sale);
    setSaleLines(sale.sale_lines || []);
    setActiveTab('sales');
  };

  const addSaleLine = () => {
    const newLine: SaleLine = {
      id: `temp-${Date.now()}`,
      sale_id: editingSale?.id || '',
      quantity: 1,
      unit_price: 0,
      financiada: false,
      transferencia: false,
      nulo: false,
      sale_lines_products: []
    };
    setSaleLines([...saleLines, newLine]);
  };

  const removeSaleLine = (index: number) => {
    setSaleLines(saleLines.filter((_, i) => i !== index));
  };

  const updateSaleLine = (index: number, field: keyof SaleLine, value: any) => {
    const updatedLines = [...saleLines];
    (updatedLines[index] as any)[field] = value;
    setSaleLines(updatedLines);
  };

  const addProduct = (lineIndex: number) => {
    const updatedLines = [...saleLines];
    if (!updatedLines[lineIndex].sale_lines_products) {
      updatedLines[lineIndex].sale_lines_products = [];
    }
    updatedLines[lineIndex].sale_lines_products!.push({
      id: `temp-${Date.now()}`,
      sale_line_id: updatedLines[lineIndex].id,
      product_name: ''
    });
    setSaleLines(updatedLines);
  };

  const removeProduct = (lineIndex: number, productIndex: number) => {
    const updatedLines = [...saleLines];
    updatedLines[lineIndex].sale_lines_products!.splice(productIndex, 1);
    setSaleLines(updatedLines);
  };

  const updateProduct = (lineIndex: number, productIndex: number, productName: string) => {
    const updatedLines = [...saleLines];
    updatedLines[lineIndex].sale_lines_products![productIndex].product_name = productName;
    setSaleLines(updatedLines);
  };

  const handleSaveSale = async () => {
    if (!editingSale) return;
    
    setLoading(true);
    try {
      // Calculate total amount
      const totalAmount = saleLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
      
      // Update sale
      const { error: saleError } = await supabase
        .from('sales')
        .update({ amount: totalAmount })
        .eq('id', editingSale.id);
      
      if (saleError) throw saleError;
      
      // Delete existing sale lines
      const { error: deleteError } = await supabase
        .from('sale_lines')
        .delete()
        .eq('sale_id', editingSale.id);
      
      if (deleteError) throw deleteError;
      
      // Insert new sale lines
      for (const line of saleLines) {
        const { data: insertedLine, error: lineError } = await supabase
          .from('sale_lines')
          .insert({
            sale_id: editingSale.id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            financiada: line.financiada,
            transferencia: line.transferencia,
            nulo: line.nulo
          })
          .select()
          .single();
        
        if (lineError) throw lineError;
        
        // Insert products for this line
        if (line.sale_lines_products && line.sale_lines_products.length > 0) {
          const productsData = line.sale_lines_products
            .filter(p => p.product_name.trim())
            .map(p => ({
              sale_line_id: insertedLine.id,
              product_name: p.product_name.trim()
            }));
          
          if (productsData.length > 0) {
            const { error: productsError } = await supabase
              .from('sale_lines_products')
              .insert(productsData);
            
            if (productsError) throw productsError;
          }
        }
      }
      
      toast({
        title: "Venta actualizada",
        description: "La venta ha sido actualizada exitosamente",
      });
      
      setEditingSale(null);
      setSaleLines([]);
      fetchSales();
      onVisitUpdated();
    } catch (error: any) {
      console.error('Error saving sale:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar la venta",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!visit) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Administrar Visita
          </DialogTitle>
          <DialogDescription>
            Panel de administración para modificar todos los aspectos de la visita
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">Información Básica</TabsTrigger>
            <TabsTrigger value="sales">Ventas ({sales.length})</TabsTrigger>
            <TabsTrigger value="danger">Zona Peligrosa</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client">Cliente</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.nombre_apellidos} {client.dni ? `(${client.dni})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="commercial">Comercial</Label>
                <Select value={selectedCommercialId} onValueChange={setSelectedCommercialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar comercial" />
                  </SelectTrigger>
                  <SelectContent>
                    {commercials.map(commercial => (
                      <SelectItem key={commercial.id} value={commercial.id}>
                        {commercial.first_name} {commercial.last_name} ({commercial.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="status">Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="secondCommercial">Segundo Comercial</Label>
                <Select value={selectedSecondCommercialId} onValueChange={setSelectedSecondCommercialId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin segundo comercial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin segundo comercial</SelectItem>
                    {commercials.map(commercial => (
                      <SelectItem key={commercial.id} value={commercial.id}>
                        {commercial.first_name} {commercial.last_name} ({commercial.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="visitState">Resultado de la Visita</Label>
                <Select value={visitStateCode} onValueChange={setVisitStateCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin resultado específico</SelectItem>
                    {visitStates.map(state => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.name.charAt(0).toUpperCase() + state.name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notas de la visita..."
                rows={4}
              />
            </div>

          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            {editingSale ? (
              <Card>
                <CardHeader>
                  <CardTitle>Editando Venta</CardTitle>
                  <CardDescription>
                    Modifica los packs de productos de esta venta
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {saleLines.map((line, lineIndex) => (
                    <Card key={lineIndex} className="p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-medium">Pack {lineIndex + 1}</h4>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeSaleLine(lineIndex)}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <Label>Cantidad</Label>
                          <Input
                            type="number"
                            value={line.quantity}
                            onChange={(e) => updateSaleLine(lineIndex, 'quantity', parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div>
                          <Label>Precio Unitario</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateSaleLine(lineIndex, 'unit_price', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      <div className="flex gap-4 mb-4">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={line.financiada}
                            onChange={(e) => updateSaleLine(lineIndex, 'financiada', e.target.checked)}
                          />
                          Financiada
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={line.transferencia}
                            onChange={(e) => updateSaleLine(lineIndex, 'transferencia', e.target.checked)}
                          />
                          Transferencia
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={line.nulo}
                            onChange={(e) => updateSaleLine(lineIndex, 'nulo', e.target.checked)}
                          />
                          Nulo
                        </label>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <Label>Productos</Label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addProduct(lineIndex)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {line.sale_lines_products?.map((product, productIndex) => (
                          <div key={productIndex} className="flex gap-2 mb-2">
                            <Input
                              placeholder="Nombre del producto"
                              value={product.product_name}
                              onChange={(e) => updateProduct(lineIndex, productIndex, e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => removeProduct(lineIndex, productIndex)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ))}

                  <div className="flex gap-2">
                    <Button onClick={addSaleLine} variant="outline">
                      <Plus className="h-4 w-4 mr-2" />
                      Añadir Pack
                    </Button>
                    <Button onClick={handleSaveSale} disabled={loading}>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar Venta
                    </Button>
                    <Button 
                      onClick={() => {
                        setEditingSale(null);
                        setSaleLines([]);
                      }} 
                      variant="outline"
                    >
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sales.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No hay ventas registradas para esta visita
                  </p>
                ) : (
                  sales.map(sale => (
                    <Card key={sale.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">Venta: €{sale.amount.toFixed(2)}</p>
                            <p className="text-sm text-muted-foreground">
                              {sale.sale_lines?.length || 0} packs de productos
                            </p>
                          </div>
                          <Button onClick={() => handleEditSale(sale)} size="sm">
                            Editar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="danger" className="space-y-4">
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Zona Peligrosa
                </CardTitle>
                <CardDescription>
                  Estas acciones son irreversibles. Úsalas con extrema precaución.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteVisit}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar Visita Completa
                </Button>
                <p className="text-sm text-muted-foreground mt-2">
                  Esta acción eliminará la visita y todas las ventas asociadas permanentemente.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button onClick={handleSaveBasicInfo} disabled={loading}>
            <Save className="h-4 w-4 mr-2" />
            Guardar
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}