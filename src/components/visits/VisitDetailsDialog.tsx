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

  return (
    <Dialog open={!!visit} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalles de la Visita
          </DialogTitle>
          <DialogDescription>
            Información completa de la visita y ventas asociadas
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Información General
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {showClientInfo && visit.client && (
                <>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                    <p className="font-medium">{visit.client.nombre_apellidos}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">DNI</label>
                    <p className="font-mono text-sm">{visit.client.dni || 'Sin DNI'}</p>
                  </div>
                </>
              )}
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Comercial</label>
                <p className="font-medium">
                  {visit.commercial?.first_name || visit.commercial?.last_name 
                    ? [visit.commercial.first_name, visit.commercial.last_name].filter(Boolean).join(' ')
                    : visit.commercial?.email || 'Sin comercial'
                  }
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Empresa</label>
                <p className="flex items-center gap-1">
                  <Building className="h-3 w-3" />
                  {visit.company?.name || 'N/A'}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Fecha y Hora</label>
                <p className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(visit.visit_date), "dd/MM/yyyy HH:mm", { locale: es })}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estado</label>
                <div>
                  {(() => {
                    const statusDisplay = getStatusDisplay(visit.status, visit.approval_status);
                    return <Badge className={statusDisplay.color}>{statusDisplay.label}</Badge>;
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>

          {visit.visit_states && (
            <Card>
              <CardContent className="pt-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Resultado de la visita</label>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-sm">
                      {visit.visit_states.name.charAt(0).toUpperCase() + visit.visit_states.name.slice(1).toLowerCase()}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {(visit.latitude && visit.longitude) && (
            <Card>
              <CardContent className="pt-6">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ubicación</label>
                  <div className="flex items-center gap-2 mt-1">
                    <a 
                      href={`https://maps.google.com/?q=${visit.latitude},${visit.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:text-primary/80 cursor-pointer hover:underline flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" />
                      {formatCoordinates(visit.latitude, visit.longitude)}
                    </a>
                    {visit.location_accuracy && (
                      <span className="text-xs text-muted-foreground">
                        (±{visit.location_accuracy.toFixed(0)}m)
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          {visit.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Notas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                  {visit.notes}
                </p>
              </CardContent>
            </Card>
          )}

          <VisitSalesSection visitSales={sales} />
        </div>
      </DialogContent>
      
      {isAdmin && onAdminManageVisit && (
        <DialogFooter className="border-t pt-4">
          <Button 
            variant="outline" 
            onClick={() => onAdminManageVisit(visit)}
            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
          >
            <Settings className="h-4 w-4 mr-2" />
            Administrar Visita
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  );
}