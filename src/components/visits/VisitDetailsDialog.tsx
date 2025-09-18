import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Calendar, User, Building, FileText, DollarSign, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import VisitSalesSection from './VisitSalesSection';

import { formatCoordinates } from '@/lib/coordinates';

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  approval_status?: 'pending' | 'approved' | 'rejected' | 'waiting_admin';
  notes?: string;
  visit_state_code?: string;
  latitude?: number;
  longitude?: number;
  location_accuracy?: number;
  permission?: string;
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
    id?: string;
    nombre_apellidos: string;
    dni?: string;
    direccion?: string;
  };
  company?: {
    name: string;
  };
  visit_states?: {
    name: string;
    description: string | null;
  };
}

interface Sale {
  id: string;
  amount: number;
  sale_date: string;
  sale_lines?: {
    products: { product_name: string }[];
    quantity: number;
    unit_price: number;
    financiada: boolean;
    transferencia: boolean;
    nulo: boolean;
  }[];
}

interface VisitDetailsDialogProps {
  visit: Visit | null;
  sales: Sale[];
  onClose: () => void;
  onAdminManageVisit?: (visit: Visit) => void;
  showClientInfo?: boolean;
}

const statusLabels = {
  in_progress: 'En progreso',
  completed: 'Confirmada',
  no_answer: 'Ausente',
  not_interested: 'Sin resultado',
  postponed: 'Oficina'
};

const statusColors = {
  in_progress: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  completed: 'bg-green-100 text-green-800 hover:bg-green-100',
  no_answer: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  not_interested: 'bg-red-100 text-red-800 hover:bg-red-100',
  postponed: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
};

const getStatusDisplay = (status: string, approvalStatus?: string) => {
  // Priority: show rejection status first
  if (approvalStatus === 'rejected') {
    return { label: 'Rechazada', color: 'bg-red-500 text-white hover:bg-red-500' };
  }
  
  // Then show normal status
  const label = statusLabels[status as keyof typeof statusLabels] || status;
  const color = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800 hover:bg-gray-100';
  
  return { label, color };
};

export default function VisitDetailsDialog({ 
  visit, 
  sales, 
  onClose,
  onAdminManageVisit,
  showClientInfo = true 
}: VisitDetailsDialogProps) {
  const { userRole } = useAuth();
  const isAdmin = userRole?.role === 'admin';
  
  if (!visit) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: es });
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

  return (
    <Dialog open={!!visit} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalles de la Visita</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {showClientInfo && visit.client && (
              <>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                  <p className="font-medium">{visit.client.nombre_apellidos}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">DNI</label>
                  <p>{visit.client.dni}</p>
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Comercial</label>
              <p>{visit.commercial ? `${visit.commercial.first_name} ${visit.commercial.last_name}` : 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Segundo Comercial</label>
              <p>{visit.second_commercial ? `${visit.second_commercial.first_name} ${visit.second_commercial.last_name}` : 'Sin segundo comercial'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Empresa</label>
              <p>{visit.company?.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Fecha</label>
              <p>{formatDate(visit.visit_date)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Estado</label>
              <div>{getStatusBadge(visit.status)}</div>
            </div>
            {visit.visit_states && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Resultado de la visita</label>
                <div>
                  <Badge variant="outline">
                    {visit.visit_states.name.charAt(0).toUpperCase() + visit.visit_states.name.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </div>
            )}
            {(visit.latitude && visit.longitude) && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Ubicación</label>
                <div className="flex items-center gap-2 mt-1">
                  <a 
                    href={`https://maps.google.com/?q=${visit.latitude},${visit.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer hover:underline flex items-center gap-1"
                  >
                    {formatCoordinates(visit.latitude, visit.longitude)}
                    <MapPin className="h-3 w-3" />
                  </a>
                  {visit.location_accuracy && (
                    <span className="text-xs text-muted-foreground">
                      (±{visit.location_accuracy.toFixed(0)}m)
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {visit.notes && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Notas</label>
              <p className="text-sm bg-muted p-2 rounded">{visit.notes}</p>
            </div>
          )}

          {sales.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Ventas</label>
              <div className="mt-2 space-y-4">
                {sales.map((sale, index) => (
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
                                  {line.products && line.products.length > 1 ? (
                                    // Pack: mostrar productos en líneas separadas
                                    <div className="space-y-1">
                                      <div className="font-medium">
                                        {line.quantity}x Pack - {formatCurrency(line.unit_price)}
                                      </div>
                                      {line.products.map((product: any, productIndex: number) => (
                                        <div key={productIndex} className="ml-2 text-muted-foreground">
                                          • {product.product_name || 'Sin nombre'}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    // Producto individual
                                    <span>
                                      {line.quantity}x {line.products?.[0]?.product_name || 'Sin producto'} - {formatCurrency(line.unit_price)}
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
  );
}