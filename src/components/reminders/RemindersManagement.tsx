import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Bell, BellOff, Trash2, UserPlus, Calendar, CheckCircle, XCircle, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import ReminderDialog from './ReminderDialog';

interface Reminder {
  id: string;
  client_id: string;
  reminder_date: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at: string;
  client?: {
    nombre_apellidos: string;
    dni?: string;
    direccion: string;
  };
  creator?: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function RemindersManagement() {
  const { userRole } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    client_name: '',
    dni: '',
    status: 'all'
  });
  const [reminderDialogOpen, setReminderDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [visitCreationDialog, setVisitCreationDialog] = useState<{ open: boolean; reminder: Reminder | null }>({ open: false, reminder: null });
  const [selectedCommercial, setSelectedCommercial] = useState<string>('');
  const [commercials, setCommercials] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const isAdmin = userRole?.role === 'admin';

  useEffect(() => {
    fetchReminders();
    fetchCommercials();
  }, [filters]);

  const fetchReminders = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('renewal_reminders')
        .select(`
          *,
          client:clients(nombre_apellidos, dni, direccion)
        `)
        .order('reminder_date', { ascending: true });

      // Apply filters
      if (filters.client_name.trim()) {
        query = query.ilike('client.nombre_apellidos', `%${filters.client_name.trim()}%`);
      }
      if (filters.dni.trim()) {
        query = query.ilike('client.dni', `%${filters.dni.trim()}%`);
      }
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Transform the data to match our interface and fetch creator info separately
      const transformedReminders: Reminder[] = await Promise.all((data || []).map(async (item) => {
        // Fetch creator info separately
        let creator;
        try {
          const { data: creatorData } = await supabase
            .from('profiles')
            .select('first_name, last_name, email')
            .eq('id', item.created_by)
            .single();
          creator = creatorData;
        } catch (error) {
          console.error('Error fetching creator:', error);
          creator = undefined;
        }

        return {
          ...item,
          status: item.status as 'pending' | 'completed' | 'cancelled',
          creator
        };
      }));
      
      setReminders(transformedReminders);
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
          client_id: visitCreationDialog.reminder.client_id,
          commercial_id: selectedCommercial,
          status: 'in_progress',
          approval_status: 'approved',
          notes: `Visita creada desde recordatorio de renovación: ${visitCreationDialog.reminder.notes || 'Sin notas'}`,
          visit_date: new Date().toISOString()
        })
        .select()
        .single();

      if (visitError) throw visitError;

      // Mark reminder as completed
      await handleStatusUpdate(visitCreationDialog.reminder.id, 'completed');

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

  if (!isAdmin) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">No tienes permisos para acceder a esta sección</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Gestión de recordatorios</h2>
          <p className="text-muted-foreground">Administra los recordatorios de renovación de clientes</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Nombre del cliente</label>
              <Input
                placeholder="Buscar por nombre..."
                value={filters.client_name}
                onChange={(e) => setFilters(prev => ({ ...prev, client_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">DNI</label>
              <Input
                placeholder="Buscar por DNI..."
                value={filters.dni}
                onChange={(e) => setFilters(prev => ({ ...prev, dni: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendientes</SelectItem>
                  <SelectItem value="completed">Completados</SelectItem>
                  <SelectItem value="cancelled">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reminders Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recordatorios ({reminders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <span className="ml-2">Cargando recordatorios...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>DNI</TableHead>
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
                      <TableCell className="font-medium">
                        {reminder.client?.nombre_apellidos || 'Cliente eliminado'}
                      </TableCell>
                      <TableCell>{reminder.client?.dni || 'N/A'}</TableCell>
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
                        <div className="flex items-center gap-2">
                          {reminder.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusUpdate(reminder.id, 'completed')}
                                className="text-green-600 border-green-600 hover:bg-green-50"
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setVisitCreationDialog({ open: true, reminder });
                                  setSelectedCommercial('');
                                }}
                                className="text-blue-600 border-blue-600 hover:bg-blue-50"
                              >
                                <UserPlus className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleStatusUpdate(reminder.id, 'cancelled')}
                                className="text-red-600 border-red-600 hover:bg-red-50"
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(reminder.id)}
                            className="text-red-600 border-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {reminders.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No hay recordatorios que coincidan con los filtros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visit Creation Dialog */}
      <Dialog open={visitCreationDialog.open} onOpenChange={(open) => setVisitCreationDialog({ open, reminder: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear visita desde recordatorio</DialogTitle>
            <DialogDescription>
              Selecciona un comercial para crear una visita aprobada y en progreso para el cliente:{' '}
              <strong>{visitCreationDialog.reminder?.client?.nombre_apellidos}</strong>
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

      {/* Reminder Dialog */}
      {selectedClient && (
        <ReminderDialog
          open={reminderDialogOpen}
          onOpenChange={setReminderDialogOpen}
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          onReminderCreated={fetchReminders}
        />
      )}
    </div>
  );
}