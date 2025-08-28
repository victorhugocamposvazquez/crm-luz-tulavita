import { useAuth } from '@/hooks/useAuth';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, UserCheck, UserX, CheckSquare, XSquare } from 'lucide-react';

export default function AdminNotifications() {
  const { userRole } = useAuth();
  const { pendingTasks, pendingApprovals, approveClientAccess, rejectClientAccess, markTaskCompleted, approveAllRequests, rejectAllRequests } = useRealtimeNotifications();

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
      {/* Bulk Actions for Approval Requests */}
      {pendingApprovals.length > 0 && (
        <div className="flex gap-2 p-3 bg-muted rounded-lg border-2 border-dashed">
          <Button
            size="sm"
            onClick={approveAllRequests}
            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-2 h-auto flex-1"
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            Aprobar Todas ({pendingApprovals.length})
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={rejectAllRequests}
            className="text-xs px-3 py-2 h-auto flex-1"
          >
            <XSquare className="h-4 w-4 mr-1" />
            Rechazar Todas ({pendingApprovals.length})
          </Button>
        </div>
      )}
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
        <div 
          key={request.id} 
          className={`p-3 border rounded-lg space-y-2 ${
            request.hasDuplicateToday 
              ? 'bg-red-100 dark:bg-red-900 border-red-500 border-2 shadow-lg animate-pulse' 
              : 'bg-orange-50 dark:bg-orange-950'
          }`}
        >
          <div className="flex items-center justify-between">
            <h4 className={`font-medium text-sm ${
              request.hasDuplicateToday 
                ? 'text-red-900 dark:text-red-100' 
                : 'text-orange-900 dark:text-orange-100'
            }`}>
              {request.hasDuplicateToday && (
                <span className="mr-2 text-red-600 font-bold text-xs bg-red-200 px-2 py-1 rounded-full animate-bounce">
                  ⚠️ MÚLTIPLES PETICIONES HOY
                </span>
              )}
              Solicitud de acceso
            </h4>
          </div>
          <p className={`text-xs line-clamp-2 ${
            request.hasDuplicateToday 
              ? 'text-red-700 dark:text-red-300' 
              : 'text-orange-700 dark:text-orange-300'
          }`}>
            {request.commercial?.first_name} {request.commercial?.last_name} solicita acceso a{' '}
            <span className={`font-medium ${
              request.hasDuplicateToday 
                ? 'text-red-900 dark:text-red-100' 
                : 'text-orange-900 dark:text-orange-100'
            }`}>
              {request.client?.nombre_apellidos}
            </span>
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