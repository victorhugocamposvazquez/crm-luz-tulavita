import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { Loader2, MessageSquarePlus, User, Mail, Phone, FileText, History } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { getLeadFieldLabel } from './lead-field-labels';
import type { Database } from '@/integrations/supabase/types';

type LeadRow = Database['public']['Tables']['leads']['Row'];

interface LeadEventRow {
  id: string;
  lead_id: string;
  type: string;
  content: Record<string, unknown> | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

const SOURCE_LABELS: Record<string, string> = {
  web_form: 'Formulario web',
  meta_lead_ads: 'Meta Lead Ads',
  meta_ads_web: 'Meta Ads Web',
  csv_import: 'Importación CSV',
  manual: 'Manual',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  lead_created: 'Lead creado',
  lead_updated: 'Lead actualizado',
  note: 'Nota',
};

function formatEventContent(type: string, content: Record<string, unknown> | null): string {
  if (!content || typeof content !== 'object') return '';
  if (type === 'note' && typeof content.note === 'string') return content.note;
  if (type === 'lead_updated' && content.updatedFields) return 'Datos actualizados';
  return '';
}

interface LeadDetailSheetProps {
  lead: LeadRow | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
}

export default function LeadDetailSheet({
  lead,
  open,
  onClose,
  onLeadUpdated,
}: LeadDetailSheetProps) {
  const [events, setEvents] = useState<LeadEventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [note, setNote] = useState('');
  const [noteSending, setNoteSending] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!lead?.id) return;
    setEventsLoading(true);
    try {
      const { data, error } = await supabase
        .from('lead_events')
        .select('id, lead_id, type, content, created_at')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEvents((data as LeadEventRow[]) ?? []);
    } catch (e) {
      console.error('Error fetching lead events:', e);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el historial',
        variant: 'destructive',
      });
    } finally {
      setEventsLoading(false);
    }
  }, [lead?.id]);

  useEffect(() => {
    if (open && lead?.id) fetchEvents();
  }, [open, lead?.id, fetchEvents]);

  const handleStatusChange = async (newStatus: string) => {
    if (!lead?.id) return;
    setStatusLoading(true);
    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      if (error) throw error;
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        type: 'lead_updated',
        content: { statusChanged: true, previousStatus: lead.status, newStatus },
      });
      onLeadUpdated?.();
      toast({ title: 'Estado actualizado' });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive',
      });
    } finally {
      setStatusLoading(false);
    }
  };

  const handleAddNote = async () => {
    const text = note.trim();
    if (!text || !lead?.id) return;
    setNoteSending(true);
    try {
      const { error } = await supabase.from('lead_events').insert({
        lead_id: lead.id,
        type: 'note',
        content: { note: text },
      });
      if (error) throw error;
      setNote('');
      fetchEvents();
      onLeadUpdated?.();
      toast({ title: 'Nota añadida' });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la nota',
        variant: 'destructive',
      });
    } finally {
      setNoteSending(false);
    }
  };

  const customFields = (lead?.custom_fields as Record<string, unknown> | null) ?? {};
  const hasCustomFields = Object.keys(customFields).length > 0;

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-left">
            {lead.name || lead.email || lead.phone || 'Lead sin nombre'}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6">
            {/* Contacto */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                <User className="h-4 w-4" />
                Contacto
              </h3>
              <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
                {lead.name && (
                  <div>
                    <span className="text-xs text-muted-foreground">Nombre</span>
                    <p className="font-medium">{lead.name}</p>
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                      {lead.phone}
                    </a>
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${lead.email}`} className="text-primary hover:underline break-all">
                      {lead.email}
                    </a>
                  </div>
                )}
                {!lead.name && !lead.phone && !lead.email && (
                  <p className="text-sm text-muted-foreground">Sin datos de contacto</p>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline">{SOURCE_LABELS[lead.source] ?? lead.source}</Badge>
                <Badge variant="secondary">
                  {format(new Date(lead.created_at), "d MMM yyyy, HH:mm", { locale: es })}
                </Badge>
              </div>
            </section>

            {/* Estado */}
            <section>
              <Label className="text-sm font-semibold text-muted-foreground">Estado</Label>
              <Select
                value={lead.status}
                onValueChange={handleStatusChange}
                disabled={statusLoading}
              >
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue />
                  {statusLoading && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin shrink-0" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {/* Respuestas del formulario (custom_fields) */}
            {hasCustomFields && (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                  <FileText className="h-4 w-4" />
                  Respuestas
                </h3>
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  {Object.entries(customFields).map(([key, value]) => {
                    const label = getLeadFieldLabel(lead.source, key);
                    let display: React.ReactNode = String(value ?? '—');
                    if (value && typeof value === 'object' && !Array.isArray(value)) {
                      const obj = value as Record<string, unknown>;
                      if (obj.name || obj.email || obj.phone) {
                        display = (
                          <span className="text-sm">
                            {[obj.name, obj.email, obj.phone].filter(Boolean).join(' · ')}
                          </span>
                        );
                      } else {
                        display = JSON.stringify(value);
                      }
                    } else if (Array.isArray(value)) {
                      display = value.join(', ');
                    }
                    return (
                      <div key={key}>
                        <span className="text-xs text-muted-foreground block">{label}</span>
                        <p className="font-medium text-sm mt-0.5">{display}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Añadir nota */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                <MessageSquarePlus className="h-4 w-4" />
                Añadir nota
              </h3>
              <div className="flex gap-2">
                <Textarea
                  placeholder="Escribe una nota de seguimiento..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <Button
                  onClick={handleAddNote}
                  disabled={!note.trim() || noteSending}
                  size="sm"
                  className="self-end shrink-0"
                >
                  {noteSending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
            </section>

            {/* Historial */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                <History className="h-4 w-4" />
                Historial
              </h3>
              {eventsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : events.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin actividad aún</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((ev) => (
                    <li
                      key={ev.id}
                      className="flex gap-3 rounded-lg border-l-2 border-muted pl-4 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">
                          {EVENT_TYPE_LABELS[ev.type] ?? ev.type}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {format(new Date(ev.created_at), "d MMM HH:mm", { locale: es })}
                        </span>
                        {formatEventContent(ev.type, ev.content) && (
                          <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                            {formatEventContent(ev.type, ev.content)}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
