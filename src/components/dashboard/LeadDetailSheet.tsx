import { useState, useCallback } from 'react';
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
import { Loader2, MessageSquarePlus, User, Mail, Phone, FileText, History, ExternalLink, MessageCircle } from 'lucide-react';
import { useConversation } from '@/hooks/useConversation';
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

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  call: 'Llamada',
  email: 'Email',
};

const LEAD_ATTACHMENTS_BUCKET = 'lead-attachments';
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

const PREVIEW_TRANSFORM = { width: 600, height: 400, quality: 80, resize: 'contain' as const };

function LeadAttachmentPreview({ path, name }: { path: string; name: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isImage = IMAGE_EXT.test(name);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const opts = isImage ? { transform: PREVIEW_TRANSFORM } : undefined;
        let result = await supabase.storage
          .from(LEAD_ATTACHMENTS_BUCKET)
          .createSignedUrl(path, 3600, opts);
        if (cancelled) return;
        if (result.error && isImage) {
          result = await supabase.storage
            .from(LEAD_ATTACHMENTS_BUCKET)
            .createSignedUrl(path, 3600);
        }
        if (cancelled) return;
        if (result.error) {
          setError(result.error.message);
          return;
        }
        setSignedUrl(result.data?.signedUrl ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al cargar');
      }
    })();
    return () => { cancelled = true; };
  }, [path, isImage]);

  if (error) {
    return (
      <p className="text-sm text-destructive mt-1">
        No se pudo cargar la factura: {error}
      </p>
    );
  }

  if (!signedUrl) {
    return (
      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando previsualización...</span>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="mt-2">
        <img
          src={signedUrl}
          alt={name}
          loading="lazy"
          decoding="async"
          className="max-w-full max-h-48 rounded border object-contain bg-muted/50"
        />
        <a
          href={signedUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs mt-1 text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir en nueva pestaña
        </a>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <a
        href={signedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="h-4 w-4" />
        Ver factura (PDF)
      </a>
      <p className="text-xs text-muted-foreground mt-0.5">{name}</p>
    </div>
  );
}

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
  const [statusLoading, setStatusLoading] = useState(false);
  const [note, setNote] = useState('');
  const [noteSending, setNoteSending] = useState(false);

  const {
    timeline,
    loading: timelineLoading,
    refetch: refetchConversation,
    getOrCreateConversation,
    sendOutboundMessage,
    sending: actionSending,
  } = useConversation(open && lead?.id ? lead.id : null);

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
      refetchConversation();
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

  const markContactedIfNew = useCallback(async () => {
    if (!lead?.id || lead.status !== 'new') return;
    try {
      await supabase.from('leads').update({ status: 'contacted', updated_at: new Date().toISOString() }).eq('id', lead.id);
      onLeadUpdated?.();
    } catch {
      /* ignore */
    }
  }, [lead?.id, lead?.status, onLeadUpdated]);

  const handleWhatsApp = async () => {
    if (!lead?.phone) {
      toast({ title: 'Sin teléfono', description: 'Este lead no tiene número', variant: 'destructive' });
      return;
    }
    const convId = await getOrCreateConversation('whatsapp');
    if (convId) await sendOutboundMessage(convId, 'Contacto iniciado por WhatsApp');
    markContactedIfNew();
    const num = lead.phone.replace(/\D/g, '').replace(/^34/, '');
    window.open(`https://wa.me/34${num}`, '_blank');
  };

  const handleCall = async () => {
    if (!lead?.phone) {
      toast({ title: 'Sin teléfono', description: 'Este lead no tiene número', variant: 'destructive' });
      return;
    }
    const convId = await getOrCreateConversation('call');
    if (convId) await sendOutboundMessage(convId, 'Llamada realizada');
    markContactedIfNew();
    window.open(`tel:${lead.phone}`, '_self');
  };

  const handleEmail = async () => {
    if (!lead?.email) {
      toast({ title: 'Sin email', description: 'Este lead no tiene email', variant: 'destructive' });
      return;
    }
    const convId = await getOrCreateConversation('email');
    if (convId) await sendOutboundMessage(convId, 'Email enviado');
    markContactedIfNew();
    window.open(`mailto:${lead.email}`, '_blank');
  };

  const rawCustom = lead?.custom_fields;
  const customFields = ((): Record<string, unknown> => {
    if (rawCustom == null) return {};
    if (typeof rawCustom === 'object' && !Array.isArray(rawCustom)) return rawCustom as Record<string, unknown>;
    if (typeof rawCustom === 'string') {
      try {
        const parsed = JSON.parse(rawCustom) as Record<string, unknown>;
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return {};
  })();
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
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!lead.phone || actionSending}
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!lead.phone || actionSending}
                  onClick={handleCall}
                >
                  <Phone className="h-4 w-4" />
                  Llamar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={!lead.email || actionSending}
                  onClick={handleEmail}
                >
                  <Mail className="h-4 w-4" />
                  Email
                </Button>
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
                    const isFacturaField = key === 'adjuntar_factura' || label === 'Factura adjunta';
                    let display: React.ReactNode = String(value ?? '—');
                    if (isFacturaField) {
                      const path = value && typeof value === 'object' && !Array.isArray(value)
                        ? (value as Record<string, unknown>).path
                        : null;
                      const pathStr = typeof path === 'string' && path.trim() ? path : null;
                      const nameStr = value && typeof value === 'object' && !Array.isArray(value)
                        ? String((value as Record<string, unknown>).name ?? '')
                        : typeof value === 'string' ? value : '';
                      if (pathStr) {
                        display = (
                          <div>
                            <p className="font-medium text-sm">{nameStr || 'Factura adjunta'}</p>
                            <LeadAttachmentPreview path={pathStr} name={nameStr} />
                          </div>
                        );
                      } else {
                        display = (
                          <div className="space-y-1.5">
                            <p className="font-medium text-sm">{nameStr || '—'}</p>
                            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                              Previsualización no disponible. El archivo se registró solo por nombre (sin subida a la nube). Para ver la imagen, los nuevos envíos del formulario guardan la factura y permiten previsualizarla aquí.
                            </p>
                          </div>
                        );
                      }
                    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
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
                        <div className="font-medium text-sm mt-0.5">{display}</div>
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

            {/* Timeline: eventos + mensajes */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-3">
                <History className="h-4 w-4" />
                Timeline
              </h3>
              {timelineLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Sin actividad aún</p>
              ) : (
                <ul className="space-y-3">
                  {timeline.map((item) => (
                    <li
                      key={item.type === 'event' ? `ev-${item.id}` : `msg-${item.id}`}
                      className="flex gap-3 rounded-lg border-l-2 border-muted pl-4 py-2 text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        {item.type === 'event' ? (
                          <>
                            <span className="font-medium">
                              {EVENT_TYPE_LABELS[item.data.type] ?? item.data.type}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {format(new Date(item.created_at), "d MMM HH:mm", { locale: es })}
                            </span>
                            {formatEventContent(item.data.type, item.data.content) && (
                              <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                                {formatEventContent(item.data.type, item.data.content)}
                              </p>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="font-medium">
                              {item.data.direction === 'outbound' ? 'Enviado' : 'Recibido'} · {CHANNEL_LABELS[item.channel] ?? item.channel}
                            </span>
                            <span className="text-muted-foreground ml-2">
                              {format(new Date(item.created_at), "d MMM HH:mm", { locale: es })}
                            </span>
                            {item.data.content && (
                              <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                                {item.data.content}
                              </p>
                            )}
                          </>
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
