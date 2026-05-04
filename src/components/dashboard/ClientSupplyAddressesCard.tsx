import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Zap, MapPin, Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import {
  draftFromSupplyRow,
  emptySupplyAddressDraft,
  fullSupplyAddressLine,
  type SupplyAddressDraft,
  type SupplyAddressRow,
} from '@/lib/clients/supplyAddresses';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ClientSupplyAddressesCardProps {
  clientId: string;
}

function mapsHref(line: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(line)}`;
}

export default function ClientSupplyAddressesCard({ clientId }: ClientSupplyAddressesCardProps) {
  const [rows, setRows] = useState<SupplyAddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDraft, setDialogDraft] = useState<SupplyAddressDraft>(() => emptySupplyAddressDraft());
  const [deleteTarget, setDeleteTarget] = useState<SupplyAddressRow | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_supply_addresses')
        .select('*')
        .eq('client_id', clientId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRows((data ?? []) as SupplyAddressRow[]);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los puntos de suministro',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setDialogDraft(emptySupplyAddressDraft());
    setDialogOpen(true);
  };

  const openEdit = (row: SupplyAddressRow) => {
    setDialogDraft(draftFromSupplyRow(row));
    setDialogOpen(true);
  };

  const saveDialog = async () => {
    const dir = dialogDraft.direccion.trim();
    if (!dir) {
      toast({
        title: 'Falta la dirección',
        description: 'Indica al menos la dirección de suministro.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Database['public']['Tables']['client_supply_addresses']['Insert'] = {
        client_id: clientId,
        label: dialogDraft.label.trim() || null,
        direccion: dir,
        localidad: dialogDraft.localidad.trim() || null,
        codigo_postal: dialogDraft.codigo_postal.trim() || null,
        cups: dialogDraft.cups.trim().replace(/\s+/g, '') || null,
        note: dialogDraft.note.trim() || null,
        sort_order: rows.length,
      };

      if (dialogDraft.dbId) {
        const { error } = await supabase
          .from('client_supply_addresses')
          .update({
            label: payload.label,
            direccion: payload.direccion,
            localidad: payload.localidad,
            codigo_postal: payload.codigo_postal,
            cups: payload.cups,
            note: payload.note,
          })
          .eq('id', dialogDraft.dbId);
        if (error) throw error;
        toast({ title: 'Punto actualizado' });
      } else {
        const { error } = await supabase.from('client_supply_addresses').insert(payload);
        if (error) throw error;
        toast({ title: 'Punto añadido' });
      }

      setDialogOpen(false);
      await fetchRows();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al guardar',
        description: e instanceof Error ? e.message : 'Inténtalo de nuevo',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      const { error } = await supabase.from('client_supply_addresses').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Punto eliminado' });
      await fetchRows();
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error al eliminar',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-3 text-xl">
              <Zap className="h-6 w-6" />
              Suministro
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Direcciones y CUPS distintos del domicilio del cliente. Gestión bajo demanda.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No hay puntos de suministro registrados.</p>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 rounded-lg border bg-muted/15 px-3 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-1">
                      {r.label?.trim() && (
                        <p className="font-medium text-foreground">{r.label.trim()}</p>
                      )}
                      <a
                        href={mapsHref(
                          fullSupplyAddressLine({
                            localId: r.id,
                            dbId: r.id,
                            label: '',
                            direccion: r.direccion,
                            localidad: r.localidad ?? '',
                            codigo_postal: r.codigo_postal ?? '',
                            cups: '',
                            note: '',
                          }),
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="break-words">
                          {r.direccion}
                          {(r.localidad || r.codigo_postal) &&
                            `, ${[r.localidad, r.codigo_postal].filter(Boolean).join(', ')}`}
                        </span>
                      </a>
                      {r.cups?.trim() && (
                        <p className="font-mono text-xs text-muted-foreground">CUPS: {r.cups}</p>
                      )}
                      {r.note?.trim() && (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{r.note}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogDraft.dbId ? 'Editar punto de suministro' : 'Nuevo punto de suministro'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Etiqueta (opcional)</Label>
              <Input
                value={dialogDraft.label}
                onChange={(e) => setDialogDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Ej. Vivienda habitual"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dirección de suministro *</Label>
              <Input
                value={dialogDraft.direccion}
                onChange={(e) => setDialogDraft((d) => ({ ...d, direccion: e.target.value }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Localidad</Label>
                <Input
                  value={dialogDraft.localidad}
                  onChange={(e) => setDialogDraft((d) => ({ ...d, localidad: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Código postal</Label>
                <Input
                  value={dialogDraft.codigo_postal}
                  onChange={(e) => setDialogDraft((d) => ({ ...d, codigo_postal: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CUPS</Label>
              <Input
                className="font-mono text-sm"
                value={dialogDraft.cups}
                onChange={(e) => setDialogDraft((d) => ({ ...d, cups: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nota</Label>
              <Textarea
                rows={3}
                className="resize-none"
                value={dialogDraft.note}
                onChange={(e) => setDialogDraft((d) => ({ ...d, note: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void saveDialog()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este punto de suministro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la dirección {deleteTarget?.label ? `«${deleteTarget.label}»` : 'de suministro'} de forma
              permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
