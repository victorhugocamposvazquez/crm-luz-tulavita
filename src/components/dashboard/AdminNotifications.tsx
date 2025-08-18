import { useAuth } from '@/hooks/useAuth';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, UserCheck, UserX } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AdminNotifications() {
  const { userRole } = useAuth();
  const { pendingTasks, pendingApprovals, approveClientAccess, rejectClientAccess, markTaskCompleted } = useRealtimeNotifications();

  if (userRole?.role !== 'admin') {
    return null;
  }

  const totalNotifications = pendingTasks.length + pendingApprovals.length;

  if (totalNotifications === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-muted-foreground text-sm">No hay notificaciones pendientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 max-h-[600px] overflow-y-auto">
      {/* New Client Tasks */}
      {pendingTasks.map((task) => (
        <div key={task.id} className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950 space-y-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 text-sm truncate">{task.title}</h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1 line-clamp-2">{task.description}</p>
              {task.client && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">
                  Cliente: {task.client.nombre_apellidos}
                </p>
              )}
              {task.commercial && (
                <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                  Comercial: {task.commercial.first_name} {task.commercial.last_name}
                </p>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => markTaskCompleted(task.id)}
              className="ml-2 shrink-0"
            >
              <CheckCircle className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {/* Client Access Approval Requests */}
      {pendingApprovals.map((request) => (
        <div key={request.id} className="p-3 border rounded-lg bg-orange-50 dark:bg-orange-950 space-y-2">
          <h4 className="font-medium text-orange-900 dark:text-orange-100 text-sm">
            Solicitud de Acceso
          </h4>
          <p className="text-xs text-orange-700 dark:text-orange-300 line-clamp-2">
            {request.commercial?.first_name} {request.commercial?.last_name} solicita acceso a{' '}
            <Link 
              to={`/client/${request.client_id}`}
              className="font-medium underline hover:text-orange-900 dark:hover:text-orange-100"
            >
              {request.client?.nombre_apellidos}
            </Link>
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              onClick={() => approveClientAccess(request.id)}
              className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1 h-auto"
            >
              <UserCheck className="h-3 w-3 mr-1" />
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => rejectClientAccess(request.id)}
              className="text-xs px-2 py-1 h-auto"
            >
              <UserX className="h-3 w-3 mr-1" />
              Rechazar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}