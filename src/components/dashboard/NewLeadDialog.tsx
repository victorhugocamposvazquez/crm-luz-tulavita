import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_LEADS_API_URL ?? '/api/leads';

interface NewLeadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NewLeadDialog({
  open,
  onClose,
  onSuccess,
}: NewLeadDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setName('');
    setPhone('');
    setEmail('');
    setNotes('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    if (!trimmedPhone && !trimmedEmail) {
      toast({
        title: 'Datos requeridos',
        description: 'Introduce al menos teléfono o email',
        variant: 'destructive',
      });
      return;
    }

    setSending(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim() || undefined,
        phone: trimmedPhone || undefined,
        email: trimmedEmail || undefined,
        source: 'manual',
      };
      if (notes.trim()) {
        body.custom_fields = { nota_creacion: notes.trim() };
      }

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error ?? 'Error al crear el lead');
      }

      toast({ title: 'Lead creado correctamente' });
      handleClose();
      onSuccess?.();
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'No se pudo crear el lead',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo lead</DialogTitle>
          <DialogDescription>
            Crea un lead manualmente. Es obligatorio indicar al menos teléfono o email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-lead-name">Nombre</Label>
            <Input
              id="new-lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre del contacto"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-lead-phone">Teléfono</Label>
            <Input
              id="new-lead-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 612 345 678"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-lead-email">Email</Label>
            <Input
              id="new-lead-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@ejemplo.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-lead-notes">Notas (opcional)</Label>
            <Input
              id="new-lead-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nota o contexto del lead"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={sending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
