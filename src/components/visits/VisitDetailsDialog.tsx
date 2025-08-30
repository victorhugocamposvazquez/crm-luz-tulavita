import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import VisitSalesSection from './VisitSalesSection';
import { MapPin } from 'lucide-react';
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
    nombre_apellidos: string;
    dni: string;
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
  selectedVisit: Visit | null;
  visitSales: Sale[];
  onClose: () => void;
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
  selectedVisit, 
  visitSales, 
  onClose, 
  showClientInfo = false 
}: VisitDetailsDialogProps) {
  if (!selectedVisit) return null;

  return (
    <Dialog open={!!selectedVisit} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalles de la Visita</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {showClientInfo && (
              <>
                <div>
                  <label className="text-sm font-medium">Cliente</label>
                  <p className="font-medium">{selectedVisit.client?.nombre_apellidos || 'Sin nombre'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">DNI</label>
                  <p>{selectedVisit.client?.dni || 'Sin DNI'}</p>
                </div>
              </>
            )}
            <div>
              <label className="text-sm font-medium">Comercial</label>
              <p className="font-medium">
                {selectedVisit.commercial?.first_name || selectedVisit.commercial?.last_name 
                  ? `${selectedVisit.commercial.first_name || ''} ${selectedVisit.commercial.last_name || ''}`.trim()
                  : selectedVisit.commercial?.email || 'Sin comercial'
                }
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Empresa</label>
              <p>{selectedVisit.company?.name || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Fecha</label>
              <p>{format(new Date(selectedVisit.visit_date), "dd/MM/yyyy HH:mm", { locale: es })}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <div>
                {(() => {
                  const statusDisplay = getStatusDisplay(selectedVisit.status, selectedVisit.approval_status);
                  return <Badge className={statusDisplay.color}>{statusDisplay.label}</Badge>;
                })()}
              </div>
            </div>
            {selectedVisit.visit_states && (
              <div>
                <label className="text-sm font-medium">Resultado de la visita</label>
                <div>
                  <Badge variant="outline">
                    {selectedVisit.visit_states.name.charAt(0).toUpperCase() + selectedVisit.visit_states.name.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </div>
            )}
            {(selectedVisit.latitude && selectedVisit.longitude) && (
              <div>
                <label className="text-sm font-medium">Ubicación</label>
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
          
          <div>
            <label className="text-sm font-medium">Notas</label>
            <p className="mt-1 p-2 border rounded-md bg-muted">
              {selectedVisit.notes || 'Sin notas'}
            </p>
          </div>

          <VisitSalesSection visitSales={visitSales} />
        </div>
      </DialogContent>
    </Dialog>
  );
}