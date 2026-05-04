import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, CalendarClock } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import AdminNotifications from '@/components/dashboard/AdminNotifications';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { useDueReminderAlerts } from '@/hooks/useDueReminderAlerts';
import { reminderKindDisplay } from '@/lib/reminders/reminderKinds';

interface AdminHeaderAlertsBellProps {
  onViewChange: (view: string) => void;
  onAfterNavigate?: () => void;
  className?: string;
}

export default function AdminHeaderAlertsBell({
  onViewChange,
  onAfterNavigate,
  className,
}: AdminHeaderAlertsBellProps) {
  const { pendingTasks, pendingApprovals } = useRealtimeNotifications();
  const { items: dueReminders, dueCount } = useDueReminderAlerts(true);

  const taskCount = pendingTasks.length + pendingApprovals.length;
  const totalAlerts = taskCount + dueCount;
  const showBadge = totalAlerts > 0;

  const goReminders = () => {
    onViewChange('reminders');
    onAfterNavigate?.();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`relative shrink-0 ${className ?? ''}`}
          title="Alertas del CRM"
          aria-label={`Alertas${showBadge ? `: ${totalAlerts} pendientes` : ''}`}
        >
          <Bell className="h-4 w-4" />
          {showBadge && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 text-[10px] p-0 flex items-center justify-center tabular-nums"
            >
              {totalAlerts > 99 ? '99+' : totalAlerts}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] sm:w-96 p-0 z-[220]" align="start">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Alertas</h3>
          <p className="text-sm text-muted-foreground">
            {totalAlerts > 0
              ? `${totalAlerts} pendiente${totalAlerts === 1 ? '' : 's'}`
              : 'Sin alertas activas'}
          </p>
        </div>

        <div className="max-h-[min(70vh,520px)] overflow-y-auto">
          {dueCount > 0 && (
            <div className="p-3 border-b bg-amber-50/80 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-100 mb-2">
                <CalendarClock className="h-3.5 w-3.5" />
                Recordatorios ({dueCount})
              </div>
              <ul className="space-y-2">
                {dueReminders.map((r) => {
                  const name = r.client?.nombre_apellidos?.trim() || 'Cliente';
                  const motivo = reminderKindDisplay(r.reminder_kind, r.custom_label);
                  const cuando = format(new Date(r.reminder_date), "d MMM yyyy, HH:mm", {
                    locale: es,
                  });
                  return (
                    <li
                      key={r.id}
                      className="rounded-md border border-amber-200/80 dark:border-amber-800 bg-background/90 px-2.5 py-2 text-xs"
                    >
                      <p className="font-medium truncate">{name}</p>
                      <p className="text-muted-foreground truncate">{motivo}</p>
                      <p className="text-amber-800 dark:text-amber-200">{cuando}</p>
                    </li>
                  );
                })}
              </ul>
              {dueCount > dueReminders.length && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Mostrando los {dueReminders.length} primeros.
                </p>
              )}
              <Button variant="outline" size="sm" className="w-full mt-3 text-xs" onClick={goReminders}>
                Ir a Recordatorios
              </Button>
            </div>
          )}

          {taskCount > 0 && <AdminNotifications />}

          {totalAlerts === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Cuando un recordatorio supere su fecha y hora, o haya tareas o solicitudes de acceso, aparecerán
              aquí y en el número rojo de la campana.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
