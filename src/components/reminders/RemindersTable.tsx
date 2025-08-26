import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Bell, Trash2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Reminder {
  id: string;
  reminder_date: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  creator?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface RemindersTableProps {
  clientId: string;
  onReminderUpdate: () => void;
}

export default function RemindersTable({ clientId, onReminderUpdate }: RemindersTableProps) {
  const { userRole } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [visitCreationDialog, setVisitCreationDialog] = useState<{ open: boolean; reminder: Reminder | null }>({ open: false, reminder: null });
  const [selectedCommercial, setSelectedCommercial] = useState<string>('');
  const [commercials, setCommercials] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const isAdmin = userRole?.role === 'admin';

  useEffect(() => {
    fetchReminders();
    if (isAdmin) {
      fetchCommercials();
    }
  }, [clientId, isAdmin]);

  const fetchReminders = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select('*')
        .eq('client_id', clientId)
        .order('reminder_date', { ascending: true });

      if (error) throw error;

      // Fetch creator info separately for each reminder
      const remindersWithCreators = await Promise.all((data || []).map(async (reminder) => {
        let creator;
        try {
          const { data: creatorData } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', reminder.created_by)
            .single();
          creator = creatorData;
        } catch (error) {
          console.error('Error fetching creator:', error);
          creator = undefined;
        }

        return {
          ...reminder,
          status: reminder.status as 'pending' | 'completed' | 'cancelled',
          creator
        };
      }));

      setReminders(remindersWithCreators);
    } catch (error: any) {
      console.error('Error fetching reminders:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los recordatorios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchCommercials = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          user_roles!inner(role)
        `)
        .eq('user_roles.role', 'commercial');

      if (error) throw error;

      const commercialsList = (data || []).map(commercial => ({
        id: commercial.id,
        name: `${commercial.first_name || ''} ${commercial.last_name || ''}`.trim() || commercial.email,
        email: commercial.email
      }));

      setCommercials(commercialsList);
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const handleStatusUpdate = async (reminderId: string, newStatus: 'completed' | 'cancelled') => {
    try {
      const { error } = await supabase
        .from('renewal_reminders')
        .update({ status: newStatus })
        .eq('id', reminderId);

      if (error) throw error;

      toast({
        title: "Estado actualizado",
        description: `Recordatorio marcado como ${newStatus === 'completed' ? 'completado' : 'cancelado'}`,
      });

      fetchReminders();
      onReminderUpdate();
    } catch (error: any) {
      console.error('Error updating reminder status:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del recordatorio",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (reminderId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este recordatorio?')) return;

    try {
      const { error } = await supabase
        .from('renewal_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;

      toast({
        title: "Recordatorio eliminado",
        description: "El recordatorio ha sido eliminado correctamente",
      });

      fetchReminders();
      onReminderUpdate();
    } catch (error: any) {
      console.error('Error deleting reminder:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el recordatorio",
        variant: "destructive",
      });
    }
  };

  const handleCreateVisit = async () => {
    if (!visitCreationDialog.reminder || !selectedCommercial) return;

    try {
      // Create approved and in_progress visit
      const { data: visitData, error: visitError } = await supabase
        .from('visits')
        .insert({
          client_id: clientId,
          commercial_id: selectedCommercial,
          status: 'in_progress',
          approval_status: 'approved',
          notes: `Visita creada desde recordatorio de renovación: ${visitCreationDialog.reminder.notes || 'Sin notas'}`,
          visit_date: new Date().toISOString()
        })
        .select()
        .single();

      if (visitError) throw visitError;

      // Delete reminder after creating visit
      await handleDelete(visitCreationDialog.reminder.id);

      toast({
        title: "Visita creada",
        description: "Se ha creado una visita aprobada y en progreso para el comercial seleccionado",
      });

      setVisitCreationDialog({ open: false, reminder: null });
      setSelectedCommercial('');
    } catch (error: any) {
      console.error('Error creating visit:', error);
      toast({
        title: "Error",
        description: "No se pudo crear la visita",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
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
      default:
        return 'Pendiente';
    }
  };

  const isPastDue = (reminderDate: string, status: string) => {
    return status === 'pending' && new Date(reminderDate) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2">Cargando recordatorios...</span>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha recordatorio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Creado por</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reminders.map((reminder) => (
              <TableRow key={reminder.id} className={isPastDue(reminder.reminder_date, reminder.status) ? 'bg-red-50' : ''}>
                <TableCell>
                  {format(new Date(reminder.reminder_date), 'PPP', { locale: es })}
                  {isPastDue(reminder.reminder_date, reminder.status) && (
                    <Badge variant="destructive" className="ml-2">Vencido</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(reminder.status)}>
                    {getStatusLabel(reminder.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="max-w-xs truncate" title={reminder.notes}>
                    {reminder.notes || 'Sin notas'}
                  </div>
                </TableCell>
                <TableCell>
                  {reminder.creator ? 
                    `${reminder.creator.first_name} ${reminder.creator.last_name}` : 
                    'Usuario eliminado'
                  }
                </TableCell>
                <TableCell>
                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      {reminder.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setVisitCreationDialog({ open: true, reminder });
                            setSelectedCommercial('');
                          }}
                          className="text-blue-600 border-blue-600 hover:bg-blue-50"
                          title="Crear visita"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(reminder.id)}
                        className="text-red-600 border-red-600 hover:bg-red-50"
                        title="Eliminar recordatorio"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {reminders.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No hay recordatorios para este cliente
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Visit Creation Dialog */}
      <Dialog open={visitCreationDialog.open} onOpenChange={(open) => setVisitCreationDialog({ open, reminder: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear visita desde recordatorio</DialogTitle>
            <DialogDescription>
              Selecciona un comercial para crear una visita aprobada y en progreso
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Comercial</label>
              <Select value={selectedCommercial} onValueChange={setSelectedCommercial}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar comercial..." />
                </SelectTrigger>
                <SelectContent>
                  {commercials.map((commercial) => (
                    <SelectItem key={commercial.id} value={commercial.id}>
                      {commercial.name} ({commercial.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setVisitCreationDialog({ open: false, reminder: null })}>
              Cancelar
            </Button>
            <Button onClick={handleCreateVisit} disabled={!selectedCommercial}>
              Crear visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}