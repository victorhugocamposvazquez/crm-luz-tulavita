import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, addWeeks, addMonths, addYears, startOfDay, setHours } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  clientName?: string;
  onReminderCreated: () => void;
}

export default function ReminderDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onReminderCreated
}: ReminderDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reminderType, setReminderType] = useState<'specific' | 'weekly' | 'monthly' | 'biannual' | 'yearly'>('specific');
  const [specificDate, setSpecificDate] = useState<Date>();
  const [startDate, setStartDate] = useState<Date>();
  const [occurrences, setOccurrences] = useState(12);
  const [notes, setNotes] = useState('');
  const [selectedClient, setSelectedClient] = useState<{id: string, name: string} | null>(null);
  const [clients, setClients] = useState<Array<{id: string, nombre_apellidos: string}>>([]);
  const [clientSearch, setClientSearch] = useState('');

  // Fetch clients when dialog opens and no client is pre-selected
  useEffect(() => {
    if (open && !clientId) {
      fetchClients();
    }
  }, [open, clientId]);

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, nombre_apellidos')
        .order('nombre_apellidos');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const getEffectiveClient = () => {
    if (clientId && clientName) {
      return { id: clientId, name: clientName };
    }
    return selectedClient;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const effectiveClient = getEffectiveClient();
    if (!effectiveClient) {
      toast({
        title: "Error",
        description: "Selecciona un cliente",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const reminders = [];

      if (reminderType === 'specific') {
        if (!specificDate) {
          toast({
            title: "Error",
            description: "Selecciona una fecha para el recordatorio",
            variant: "destructive",
          });
          return;
        }

        // Set time to 9:00 AM
        const reminderDate = setHours(startOfDay(specificDate), 9);
        reminders.push({
          client_id: effectiveClient.id,
          reminder_date: reminderDate.toISOString(),
          notes: notes || null,
          created_by: user.id
        });
      } else {
        if (!startDate) {
          toast({
            title: "Error",
            description: "Selecciona una fecha de inicio",
            variant: "destructive",
          });
          return;
        }

        let baseDate = startOfDay(startDate);
        
        // For weekly, always start on Monday at 9 AM
        if (reminderType === 'weekly') {
          const dayOfWeek = baseDate.getDay();
          const daysToMonday = dayOfWeek === 0 ? 1 : 1 - dayOfWeek;
          baseDate = addWeeks(baseDate, daysToMonday >= 0 ? 0 : 1);
          if (daysToMonday > 0) {
            baseDate = new Date(baseDate.getTime() + daysToMonday * 24 * 60 * 60 * 1000);
          }
        }
        // For monthly, biannual and yearly, set to day 1 at 9 AM
        else if (reminderType === 'monthly') {
          baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        } else if (reminderType === 'biannual') {
          baseDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        } else if (reminderType === 'yearly') {
          baseDate = new Date(baseDate.getFullYear(), 0, 1);
        }

        // Set time to 9:00 AM
        baseDate = setHours(baseDate, 9);

        for (let i = 0; i < occurrences; i++) {
          let reminderDate = baseDate;
          
          if (reminderType === 'weekly') {
            reminderDate = addWeeks(baseDate, i);
          } else if (reminderType === 'monthly') {
            reminderDate = addMonths(baseDate, i);
          } else if (reminderType === 'biannual') {
            reminderDate = addMonths(baseDate, i * 6);
          } else if (reminderType === 'yearly') {
            reminderDate = addYears(baseDate, i);
          }

          reminders.push({
            client_id: effectiveClient.id,
            reminder_date: reminderDate.toISOString(),
            notes: notes || null,
            created_by: user.id
          });
        }
      }

      const { error } = await supabase
        .from('renewal_reminders')
        .insert(reminders);

      if (error) throw error;

      toast({
        title: "Recordatorio creado",
        description: `Se ${reminders.length > 1 ? 'han creado' : 'ha creado'} ${reminders.length} recordatorio${reminders.length > 1 ? 's' : ''} para ${effectiveClient.name}`,
      });

      onReminderCreated();
      onOpenChange(false);
      setReminderType('specific');
      setSpecificDate(undefined);
      setStartDate(undefined);
      setOccurrences(12);
      setNotes('');
      setSelectedClient(null);
      setClientSearch('');
    } catch (error: any) {
      console.error('Error creating reminder:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el recordatorio",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const typeLabels = {
    specific: 'Fecha específica',
    weekly: 'Semanal (lunes a las 09:00)',
    monthly: 'Mensual (día 1 a las 09:00)',
    biannual: 'Cada 6 meses (día 1 a las 09:00)',
    yearly: 'Anual (1 enero a las 09:00)'
  };

  const filteredClients = clients.filter(client =>
    client.nombre_apellidos.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear recordatorio de renovación</DialogTitle>
          <DialogDescription>
            {clientName ? (
              <>Cliente: <strong>{clientName}</strong></>
            ) : (
              'Selecciona un cliente y configura el recordatorio'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!clientId && (
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {filteredClients.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {filteredClients.slice(0, 10).map((client) => (
                      <div
                        key={client.id}
                        className={cn(
                          "p-2 cursor-pointer hover:bg-muted",
                          selectedClient?.id === client.id && "bg-primary text-primary-foreground"
                        )}
                        onClick={() => {
                          setSelectedClient({ id: client.id, name: client.nombre_apellidos });
                          setClientSearch(client.nombre_apellidos);
                        }}
                      >
                        {client.nombre_apellidos}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>Tipo de recordatorio</Label>
            <Select value={reminderType} onValueChange={(value: any) => setReminderType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(typeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reminderType === 'specific' ? (
            <div className="space-y-2">
              <Label>Fecha del recordatorio</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !specificDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {specificDate ? format(specificDate, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={specificDate}
                    onSelect={setSpecificDate}
                    disabled={(date) => date < new Date()}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Fecha de inicio</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => date < new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occurrences">Número de ocurrencias</Label>
                <Input
                  id="occurrences"
                  type="number"
                  min="1"
                  max="100"
                  value={occurrences}
                  onChange={(e) => setOccurrences(parseInt(e.target.value) || 1)}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Agregar información adicional sobre el recordatorio..."
              rows={3}
            />
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creando...' : 'Crear recordatorio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}