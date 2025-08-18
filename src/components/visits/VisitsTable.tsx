import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';

interface Visit {
  id: string;
  visit_date: string;
  status: 'in_progress' | 'completed' | 'no_answer' | 'not_interested' | 'postponed';
  client_id?: string;
  commercial_id?: string;
  created_at?: string;
  approval_status?: string;
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
  loading: boolean;
  showClientColumns?: boolean;
  emptyMessage?: string;
}

const statusLabels = {
  in_progress: 'En progreso',
  completed: 'Completada',
  no_answer: 'Sin respuesta',
  not_interested: 'No interesado',
  postponed: 'Aplazada'
};

const statusColors = {
  in_progress: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  completed: 'bg-green-100 text-green-800 hover:bg-green-100',
  no_answer: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  not_interested: 'bg-red-100 text-red-800 hover:bg-red-100',
  postponed: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
};

export default function VisitsTable({ 
  visits, 
  sales, 
  onViewVisit, 
  loading, 
  showClientColumns = false,
  emptyMessage = "No hay visitas registradas" 
}: VisitsTableProps) {
  if (loading) {
    return <div className="text-center py-4">Cargando visitas...</div>;
  }

  const getCommercialName = (commercial: any) => {
    if (!commercial) return 'Sin comercial';
    const name = [commercial.first_name, commercial.last_name].filter(Boolean).join(' ');
    return name || commercial.email;
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
          <TableHead>Resultado</TableHead>
          <TableHead>Ventas</TableHead>
          <TableHead>Comisión</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visits.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showClientColumns ? 9 : 7} className="text-center py-8 text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          visits.map((visit) => {
            // Find sales for this visit and calculate commission properly
            const visitSales = sales.filter(sale => sale.visit_id === visit.id);
            const totalSales = visitSales.reduce((sum, sale) => sum + sale.amount, 0);
            // Calculate commission using stored amount or calculate from percentage (default 5%)
            const totalCommission = visitSales.reduce((sum, sale) => {
              const commission = sale.commission_amount || (sale.amount * ((sale as any).commission_percentage || 5) / 100);
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
                    <TableCell>{visit.client?.dni || 'Sin DNI'}</TableCell>
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
                  <Badge className={statusColors[visit.status]}>
                    {statusLabels[visit.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {totalSales > 0 ? `€${totalSales.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell>
                  {totalCommission > 0 ? `€${totalCommission.toFixed(2)}` : '-'}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" onClick={() => onViewVisit(visit)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}