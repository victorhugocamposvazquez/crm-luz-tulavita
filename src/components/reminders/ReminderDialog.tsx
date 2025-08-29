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
import { CalendarIcon, X } from 'lucide-react';
import { format, addDays, addMonths, addYears, startOfDay, setHours } from 'date-fns';
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
  const [reminderType, setReminderType] = useState<'specific' | 'tomorrow' | 'six_months' | 'eleven_months' | 'five_years'>('specific');
  const [specificDate, setSpecificDate] = useState<Date>();
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

  // Auto-calculate date based on reminder type
  const getCalculatedDate = () => {
    const today = new Date();
    switch (reminderType) {
      case 'tomorrow':
        return addDays(today, 1);
      case 'six_months':
        return addMonths(today, 6);
      case 'eleven_months':
        return addMonths(today, 11);
      case 'five_years':
        return addYears(today, 5);
      default:
        return specificDate;
    }
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

    const finalDate = getCalculatedDate();
    if (!finalDate) {
      toast({
        title: "Error",
        description: "Selecciona una fecha para el recordatorio",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Set time to 9:00 AM
      const reminderDate = setHours(startOfDay(finalDate), 9);
      
      const { error } = await supabase
        .from('renewal_reminders')
        .insert([{
          client_id: effectiveClient.id,
          reminder_date: reminderDate.toISOString(),
          notes: notes || null,
          created_by: user.id
        }]);

      if (error) throw error;

      toast({
        title: "Recordatorio creado",
        description: `Se ha creado el recordatorio para ${effectiveClient.name}`,
      });

      onReminderCreated();
      onOpenChange(false);
      setReminderType('specific');
      setSpecificDate(undefined);
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
    tomorrow: 'Al día siguiente',
    six_months: 'Dentro de 6 meses',
    eleven_months: 'Dentro de 11 meses',
    five_years: 'Dentro de 5 años'
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
                {!selectedClient ? (
                  <>
                    <Input
                      placeholder="Buscar cliente..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    {clientSearch.length > 0 && filteredClients.length > 0 && (
                      <div className="border rounded-md max-h-40 overflow-y-auto">
                        {filteredClients.slice(0, 10).map((client) => (
                          <div
                            key={client.id}
                            className="p-2 cursor-pointer hover:bg-muted"
                            onClick={() => {
                              setSelectedClient({ id: client.id, name: client.nombre_apellidos });
                              setClientSearch('');
                            }}
                          >
                            {client.nombre_apellidos}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-between p-2 border rounded-md bg-muted">
                    <span>{selectedClient.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedClient(null);
                        setClientSearch('');
                      }}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
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

          <div className="space-y-2">
            <Label>Fecha del recordatorio</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !getCalculatedDate() && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {getCalculatedDate() ? format(getCalculatedDate()!, 'PPP', { locale: es }) : 'Seleccionar fecha'}
                </Button>
              </PopoverTrigger>
              {reminderType === 'specific' && (
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
              )}
            </Popover>
            {reminderType !== 'specific' && (
              <p className="text-sm text-muted-foreground">
                Fecha automáticamente calculada basada en la selección
              </p>
            )}
          </div>

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