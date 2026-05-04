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
import { format, addDays, addMonths, addYears, startOfDay, setHours, setMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  REMINDER_KIND_VALUES,
  type ReminderKind,
  reminderKindLabel,
} from '@/lib/reminders/reminderKinds';

interface ReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  clientName?: string;
  onReminderCreated: () => void;
}

type DatePreset = 'specific' | 'today' | 'tomorrow' | 'six_months' | 'eleven_months' | 'five_years';

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  specific: 'Fecha concreta',
  today: 'Hoy',
  tomorrow: 'Mañana',
  six_months: 'Dentro de 6 meses (día 1)',
  eleven_months: 'Dentro de 11 meses (día 1)',
  five_years: 'Dentro de 5 años (día 1)',
};

function dateForPreset(preset: Exclude<DatePreset, 'specific'>): Date {
  const today = new Date();
  switch (preset) {
    case 'today':
      return today;
    case 'tomorrow':
      return addDays(today, 1);
    case 'six_months': {
      const d = addMonths(today, 6);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    case 'eleven_months': {
      const d = addMonths(today, 11);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    case 'five_years': {
      const d = addYears(today, 5);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
  }
}

function applyTimeToDate(base: Date, timeStr: string | undefined): Date {
  const d = startOfDay(base);
  if (timeStr && /^\d{1,2}:\d{2}$/.test(timeStr)) {
    const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10));
    return setMinutes(setHours(d, h), m);
  }
  return setHours(d, 9, 0, 0, 0);
}

export default function ReminderDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onReminderCreated,
}: ReminderDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reminderKind, setReminderKind] = useState<ReminderKind>('renewal');
  const [customLabel, setCustomLabel] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('specific');
  const [specificDate, setSpecificDate] = useState<Date | undefined>();
  const [timeStr, setTimeStr] = useState('');
  const [notes, setNotes] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [clients, setClients] = useState<Array<{ id: string; nombre_apellidos: string }>>([]);
  const [clientSearch, setClientSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setReminderKind('renewal');
    setCustomLabel('');
    setDatePreset('specific');
    setSpecificDate(undefined);
    setTimeStr('');
    setNotes('');
    if (!clientId) {
      setSelectedClient(null);
      setClientSearch('');
      void fetchClients();
    }
  }, [open, clientId]);

  useEffect(() => {
    if (!open || datePreset === 'specific') return;
    setSpecificDate(dateForPreset(datePreset));
  }, [datePreset, open]);

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
    if (!user?.id) {
      toast({
        title: 'Error',
        description: 'No hay sesión activa.',
        variant: 'destructive',
      });
      return;
    }

    if (reminderKind === 'custom' && !customLabel.trim()) {
      toast({
        title: 'Describe el recordatorio',
        description: 'Cuando eliges «Otro», escribe un título o motivo.',
        variant: 'destructive',
      });
      return;
    }

    const effectiveClient = getEffectiveClient();
    if (!effectiveClient) {
      toast({
        title: 'Error',
        description: 'Selecciona un cliente',
        variant: 'destructive',
      });
      return;
    }

    const finalDate = specificDate;
    if (!finalDate) {
      toast({
        title: 'Error',
        description: 'Selecciona una fecha para el recordatorio',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const reminderDate = applyTimeToDate(finalDate, timeStr || undefined);

      const { error } = await supabase.from('renewal_reminders').insert([
        {
          client_id: effectiveClient.id,
          reminder_date: reminderDate.toISOString(),
          notes: notes.trim() || null,
          created_by: user.id,
          reminder_kind: reminderKind,
          custom_label:
            reminderKind === 'custom' ? customLabel.trim().slice(0, 200) : null,
        },
      ]);

      if (error) throw error;

      toast({
        title: 'Recordatorio creado',
        description: `Para ${effectiveClient.name} el ${format(reminderDate, "PPP 'a las' HH:mm", { locale: es })}.`,
      });

      onReminderCreated();
      onOpenChange(false);
      setReminderKind('renewal');
      setCustomLabel('');
      setDatePreset('specific');
      setSpecificDate(undefined);
      setTimeStr('');
      setNotes('');
      setSelectedClient(null);
      setClientSearch('');
    } catch (error: unknown) {
      console.error('Error creating reminder:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'No se pudo crear el recordatorio',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((client) =>
    client.nombre_apellidos.toLowerCase().includes(clientSearch.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col sm:max-w-md">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Crear recordatorio</DialogTitle>
          <DialogDescription>
            {clientName ? (
              <>
                Cliente: <strong>{clientName}</strong>
              </>
            ) : (
              'Selecciona un cliente y configura fecha, hora opcional y motivo.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {!clientId && (
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="space-y-2">
                {!selectedClient ? (
                  <>
                    <Input
                      placeholder="Buscar cliente…"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    {clientSearch.length > 0 && filteredClients.length > 0 && (
                      <div className="border rounded-md max-h-40 overflow-y-auto z-10 relative">
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
            <Label htmlFor="reminder-kind">Motivo</Label>
            <Select
              value={reminderKind}
              onValueChange={(v) => setReminderKind(v as ReminderKind)}
              disabled={loading}
            >
              <SelectTrigger id="reminder-kind">
                <SelectValue placeholder="Tipo de recordatorio" />
              </SelectTrigger>
              <SelectContent className="z-[220] max-h-[min(300px,60vh)]">
                {REMINDER_KIND_VALUES.filter((k) => k !== 'custom').map((k) => (
                  <SelectItem key={k} value={k}>
                    {reminderKindLabel(k)}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Otro (describir)</SelectItem>
              </SelectContent>
            </Select>
            {reminderKind === 'custom' && (
              <Input
                placeholder="Ej. llamar por presupuesto, visita…"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                maxLength={200}
                disabled={loading}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Cuándo</Label>
            <Select
              value={datePreset}
              onValueChange={(v) => setDatePreset(v as DatePreset)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[220]">
                {(Object.keys(DATE_PRESET_LABELS) as DatePreset[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {DATE_PRESET_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {datePreset === 'specific' && (
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !specificDate && 'text-muted-foreground',
                    )}
                    disabled={loading}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {specificDate
                      ? format(specificDate, 'PPP', { locale: es })
                      : 'Seleccionar fecha en el calendario'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="z-[220] w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={specificDate}
                    onSelect={(d) => {
                      setSpecificDate(d);
                      setCalendarOpen(false);
                    }}
                    disabled={(date) => date < startOfDay(new Date())}
                    initialFocus
                    locale={es}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reminder-time">Hora (opcional)</Label>
            <Input
              id="reminder-time"
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              disabled={loading}
              className="w-full sm:w-40"
            />
            <p className="text-xs text-muted-foreground">Si la dejas vacía, se usa las 9:00.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Información adicional…"
              rows={3}
              disabled={loading}
            />
          </div>

          <DialogFooter className="flex-shrink-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || !specificDate}>
              {loading ? 'Creando...' : 'Crear recordatorio'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
