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
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [commercials, setCommercials] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  const isAdmin = userRole?.role === 'admin';

  useEffect(() => {
    fetchReminders();
    if (isAdmin) {
      fetchCommercials();
      fetchCompanies();
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
      console.log('Fetching commercials...');
      // First get user_roles with role 'commercial'
      const { data: userRoles, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'commercial');

      if (roleError) {
        console.error('Error fetching user roles:', roleError);
        throw roleError;
      }

      console.log('User roles data:', userRoles);

      if (!userRoles || userRoles.length === 0) {
        console.log('No commercials found');
        setCommercials([]);
        return;
      }

      // Then get profiles for those users
      const userIds = userRoles.map(role => role.user_id);
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', userIds);

      if (profileError) {
        console.error('Error fetching profiles:', profileError);
        throw profileError;
      }

      console.log('Profiles data:', profiles);

      const commercialsList = (profiles || []).map(profile => ({
        id: profile.id,
        name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
        email: profile.email
      }));

      console.log('Transformed commercials:', commercialsList);
      setCommercials(commercialsList);
    } catch (error) {
      console.error('Error fetching commercials:', error);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data: companiesData, error } = await supabase
        .from('companies')
        .select('id, name')
        .order('name');

      if (error) throw error;

      setCompanies(companiesData || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
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

  const handleDelete = async (reminderId: string, showConfirm: boolean = true) => {
    if (showConfirm && !confirm('¿Estás seguro de que quieres eliminar este recordatorio?')) return;

    try {
      const { error } = await supabase
        .from('renewal_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;

      if (showConfirm) {
        toast({
          title: "Recordatorio eliminado",
          description: "El recordatorio ha sido eliminado correctamente",
        });
        fetchReminders();
        onReminderUpdate();
      }
    } catch (error: any) {
      console.error('Error deleting reminder:', error);
      if (showConfirm) {
        toast({
          title: "Error",
          description: "No se pudo eliminar el recordatorio",
          variant: "destructive",
        });
      }
      throw error;
    }
  };

  const handleCreateVisit = async () => {
    console.log('=== STARTING handleCreateVisit ===');
    console.log('visitCreationDialog:', visitCreationDialog);
    console.log('selectedCommercial:', selectedCommercial);
    console.log('selectedCompany:', selectedCompany);
    
    if (!visitCreationDialog.reminder || !selectedCommercial || !selectedCompany) {
      console.log('=== MISSING REQUIRED DATA ===');
      console.log('reminder exists:', !!visitCreationDialog.reminder);
      console.log('selectedCommercial exists:', !!selectedCommercial);
      console.log('selectedCompany exists:', !!selectedCompany);
      return;
    }

    try {
      // Prepare notes from reminder
      const reminder = visitCreationDialog.reminder;
      console.log('=== PROCESSING REMINDER ===');
      console.log('Full reminder object:', reminder);
      console.log('reminder.notes:', reminder.notes);
      console.log('typeof reminder.notes:', typeof reminder.notes);
      
      const reminderNotes = reminder.notes || '';
      const visitNotes = reminderNotes ? `${reminderNotes}\n\n--\n\n` : '--\n\n';
      
      console.log('=== PREPARED NOTES ===');
      console.log('reminderNotes:', JSON.stringify(reminderNotes));
      console.log('visitNotes:', JSON.stringify(visitNotes));

      // Create approved and in_progress visit
      const visitData = {
        client_id: clientId,
        commercial_id: selectedCommercial,
        company_id: selectedCompany,
        status: 'in_progress' as const,
        approval_status: 'approved' as const,
        notes: visitNotes,
        visit_date: new Date().toISOString()
      };
      
      console.log('=== INSERTING VISIT WITH DATA ===');
      console.log('visitData:', visitData);
      
      const { data: createdVisit, error: visitError } = await supabase
        .from('visits')
        .insert(visitData)
        .select()
        .maybeSingle();

      if (visitError) {
        console.error('=== VISIT INSERT ERROR ===', visitError);
        throw visitError;
      }

      console.log('=== VISIT CREATED SUCCESSFULLY ===');
      console.log('Created visit:', createdVisit);

      // Delete reminder after creating visit (without confirmation)
      await handleDelete(visitCreationDialog.reminder.id, false);

      toast({
        title: "Visita creada",
        description: "Se ha creado una visita aprobada y en progreso para el comercial seleccionado",
      });

      setVisitCreationDialog({ open: false, reminder: null });
      setSelectedCommercial('');
      setSelectedCompany('');
      fetchReminders();
      onReminderUpdate();
    } catch (error: any) {
      console.error('=== ERROR IN handleCreateVisit ===', error);
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
            
            <div>
              <label className="text-sm font-medium">Empresa</label>
              <Select value={selectedCompany} onValueChange={setSelectedCompany}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
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
            <Button onClick={handleCreateVisit} disabled={!selectedCommercial || !selectedCompany}>
              Crear visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}