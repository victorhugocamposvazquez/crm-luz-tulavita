import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Settings, Bell } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { calculateCommission, calculateSaleCommission } from '@/lib/commission';
import { useAuth } from '@/hooks/useAuth';

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  client_id?: string;
  commercial_id?: string;
  created_at?: string;
  approval_status?: string;
  notes?: string;
  permission?: string;
  visit_states?: {
    name: string;
    description: string;
  };
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
}

interface Sale {
  id: string;
  amount: number;
  commission_amount: number;
  visit_id?: string;
}

interface VisitsTableProps {
  visits: Visit[];
  sales: Sale[];
  onViewVisit: (visit: Visit) => void | Promise<void>;
  onAdminManageVisit?: (visit: Visit) => void;
  onCreateReminder?: (visit: Visit) => void;
  loading: boolean;
  showClientColumns?: boolean;
  emptyMessage?: string;
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

export default function VisitsTable({ 
  visits, 
  sales, 
  onViewVisit,
  onAdminManageVisit,
  onCreateReminder,
  loading, 
  showClientColumns = false,
  emptyMessage = "No hay visitas registradas" 
}: VisitsTableProps) {
  const { userRole } = useAuth();
  const isAdmin = userRole?.role === 'admin';
  if (loading) {
    return <div className="text-center py-4">Cargando visitas...</div>;
  }

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    const name = [commercial.first_name, commercial.last_name].filter(Boolean).join(' ');
    return name || commercial.email;
  };

  const truncateNotes = (notes: string | undefined, maxLength: number = 50) => {
    if (!notes) return '-';
    if (notes.length <= maxLength) return notes;
    return notes.substring(0, maxLength) + '...';
  };

  const renderNotesCell = (visit: Visit) => {
    if (!visit.notes) {
      return (
        <span 
          className="text-muted-foreground cursor-pointer hover:text-muted-foreground/80"
          onClick={() => onViewVisit(visit)}
        >
          -
        </span>
      );
    }
    
    if (visit.notes.length <= 50) {
      return (
        <span 
          className="cursor-pointer hover:text-foreground/80"
          onClick={() => onViewVisit(visit)}
        >
          {visit.notes}
        </span>
      );
    }
    
    return (
      <span 
        className="cursor-pointer hover:text-foreground/80"
        onClick={() => onViewVisit(visit)}
      >
        {visit.notes.substring(0, 50)}...
      </span>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showClientColumns && (
            <>
              <TableHead>Cliente</TableHead>
              <TableHead>DNI</TableHead>
            </>
          )}
          <TableHead>Comercial</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Resultado de la visita</TableHead>
          <TableHead>Notas</TableHead>
          <TableHead>Ventas</TableHead>
          <TableHead>Comisión</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visits.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showClientColumns ? 11 : 9} className="text-center py-8 text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          visits.map((visit) => {
            // Find sales for this visit and calculate commission properly
            const visitSales = sales.filter(sale => sale.visit_id === visit.id);
            const totalSales = visitSales.reduce((sum, sale) => sum + sale.amount, 0);
            // Calculate commission using stored amount or calculate with new system
            const totalCommission = visitSales.reduce((sum, sale) => {
              const commission = calculateSaleCommission(sale);
              return sum + commission;
            }, 0);
            
            return (
              <TableRow key={visit.id}>
                {showClientColumns && (
                  <>
                     <TableCell className="font-medium">
                       <Link 
                         to={`/client/${visit.client_id || visit.id}`}
                         className="text-primary hover:text-primary/80 hover:underline"
                       >
                         {visit.client?.nombre_apellidos || 'Sin nombre'}
                       </Link>
                     </TableCell>
                    <TableCell>{visit.client?.dni || '-'}</TableCell>
                  </>
                )}
                <TableCell className="font-medium">
                  {getCommercialName(visit.commercial)}
                </TableCell>
                <TableCell>{visit.company?.name || 'N/A'}</TableCell>
                <TableCell>
                  {format(new Date(visit.visit_date), "dd/MM/yyyy HH:mm", { locale: es })}
                </TableCell>
                <TableCell>
                  {(() => {
                    const statusDisplay = getStatusDisplay(visit.status, visit.approval_status);
                    return <Badge className={statusDisplay.color}>{statusDisplay.label}</Badge>;
                  })()}
                </TableCell>
                <TableCell>
                  {visit.visit_states?.name ? 
                    visit.visit_states.name.charAt(0).toUpperCase() + visit.visit_states.name.slice(1).toLowerCase() 
                    : visit.status ? 
                    statusLabels[visit.status as keyof typeof statusLabels]?.charAt(0).toUpperCase() + statusLabels[visit.status as keyof typeof statusLabels]?.slice(1).toLowerCase() 
                    : '-'
                  }
                </TableCell>
                <TableCell className="max-w-xs">
                  {renderNotesCell(visit)}
                </TableCell>
                <TableCell>
                  {totalSales > 0 ? `€${totalSales.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell>
                  {totalCommission > 0 ? `€${totalCommission.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => onViewVisit(visit)}
                      title="Ver detalles"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {onCreateReminder && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCreateReminder(visit)}
                        title="Crear recordatorio"
                      >
                        <Bell className="h-4 w-4" />
                      </Button>
                    )}
                    {isAdmin && onAdminManageVisit && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => onAdminManageVisit(visit)}
                        title="Administrar visita"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}