import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { User, MapPin, Calendar, FileText, DollarSign, Package } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface DeliveryDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  delivery: {
    id: string;
    visit_id: string;
    delivery_id: string;
    status: string;
    notes?: string;
    created_at: string;
    visit?: {
      id: string;
      visit_date: string;
      status: string;
      notes?: string;
      client?: {
        id: string;
        nombre_apellidos: string;
        direccion: string;
        dni?: string;
      };
      commercial?: {
        first_name: string;
        last_name: string;
        email: string;
      };
    };
    deliveryUser?: {
      first_name: string;
      last_name: string;
      email: string;
    };
  } | null;
}

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  commission_amount: number;
  sale_lines?: {
    quantity: number;
    unit_price: number;
    financiada: boolean;
    nulo: boolean;
    products: { product_name: string }[];
  }[];
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

export default function DeliveryDetailDialog({ open, onOpenChange, delivery }: DeliveryDetailDialogProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [visitHistory, setVisitHistory] = useState<VisitHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && delivery?.visit_id) {
      fetchVisitDetails();
    }
  }, [open, delivery?.visit_id]);

  const fetchVisitDetails = async () => {
    if (!delivery?.visit_id) return;

    setLoading(true);
    try {
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select('id, amount, sale_date, commission_amount')
        .eq('visit_id', delivery.visit_id);

      if (salesError) throw salesError;

      const salesWithLines = await Promise.all((salesData || []).map(async (sale) => {
        const { data: lines } = await supabase
          .from('sale_lines')
          .select(`
            quantity, unit_price, financiada, nulo,
            sale_lines_products(product_name)
          `)
          .eq('sale_id', sale.id);

        return {
          ...sale,
          sale_lines: (lines || []).map(line => ({
            quantity: line.quantity,
            unit_price: line.unit_price,
            financiada: line.financiada,
            nulo: line.nulo,
            products: line.sale_lines_products || []
          }))
        };
      }));

      setSales(salesWithLines);

      const { data: historyData, error: historyError } = await supabase
        .from('visit_progress_history')
        .select('id, recorded_at, note, visit_state_code, commercial_id')
        .eq('visit_id', delivery.visit_id)
        .order('recorded_at', { ascending: false });

      if (historyError) throw historyError;

      const commercialIds = [...new Set((historyData || []).map(h => h.commercial_id))];
      const commercialsMap = new Map();

      if (commercialIds.length > 0) {
        const { data: commercialsData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', commercialIds);

        (commercialsData || []).forEach(c => commercialsMap.set(c.id, c));
      }

      const historyWithCommercials = (historyData || []).map(h => ({
        ...h,
        commercial: commercialsMap.get(h.commercial_id)
      }));

      setVisitHistory(historyWithCommercials);
    } catch (error) {
      console.error('Error fetching visit details:', error);
    } finally {
      setLoading(false);
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

  if (!delivery) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle del Reparto
            <Badge className={getStatusColor(delivery.status)}>
              {getStatusLabel(delivery.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Información del Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nombre</p>
                    <p className="font-medium">{delivery.visit?.client?.nombre_apellidos || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">DNI</p>
                    <p className="font-medium">{delivery.visit?.client?.dni || 'N/A'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Dirección</p>
                  <p className="font-medium flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {delivery.visit?.client?.direccion || 'N/A'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Información de la Visita
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Comercial Original</p>
                    <p className="font-medium">
                      {delivery.visit?.commercial ? 
                        `${delivery.visit.commercial.first_name} ${delivery.visit.commercial.last_name}` : 
                        'N/A'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Fecha de Visita</p>
                    <p className="font-medium">
                      {delivery.visit?.visit_date ? 
                        format(new Date(delivery.visit.visit_date), 'dd/MM/yyyy HH:mm', { locale: es }) : 
                        'N/A'
                      }
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Repartidor Asignado</p>
                  <p className="font-medium">
                    {delivery.deliveryUser ? 
                      `${delivery.deliveryUser.first_name} ${delivery.deliveryUser.last_name}` : 
                      'N/A'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {delivery.visit?.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Notas de la Visita
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm">{delivery.visit.notes}</p>
                </CardContent>
              </Card>
            )}

            {visitHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Histórico de la Visita ({visitHistory.length})
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
                        {history.visit_state_code && (
                          <Badge variant="outline" className="mt-1">{history.visit_state_code}</Badge>
                        )}
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
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Ventas Asociadas ({sales.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : sales.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">No hay ventas asociadas a esta visita</p>
                ) : (
                  <div className="space-y-4">
                    {sales.map((sale) => (
                      <div key={sale.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="font-medium">
                            {format(new Date(sale.sale_date), 'dd/MM/yyyy', { locale: es })}
                          </p>
                          <div className="text-right">
                            <p className="font-bold text-lg">{sale.amount.toFixed(2)} €</p>
                            <p className="text-sm text-muted-foreground">
                              Comisión: {sale.commission_amount?.toFixed(2) || '0.00'} €
                            </p>
                          </div>
                        </div>
                        
                        {sale.sale_lines && sale.sale_lines.length > 0 && (
                          <>
                            <Separator className="my-3" />
                            <div className="space-y-2">
                              <p className="text-sm font-medium flex items-center gap-1">
                                <Package className="h-4 w-4" />
                                Productos
                              </p>
                              {sale.sale_lines.map((line, idx) => (
                                <div key={idx} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                                  <div>
                                    <span className="font-medium">
                                      {line.products.map(p => p.product_name).join(', ') || 'Producto'}
                                    </span>
                                    <span className="text-muted-foreground ml-2">x{line.quantity}</span>
                                    {line.financiada && <Badge variant="outline" className="ml-2">Financiada</Badge>}
                                    {line.nulo && <Badge variant="destructive" className="ml-2">Nulo</Badge>}
                                  </div>
                                  <span>{(line.quantity * line.unit_price).toFixed(2)} €</span>
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
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
