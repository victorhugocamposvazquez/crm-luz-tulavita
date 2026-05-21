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
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { CollaboratorKitMenu } from './CollaboratorKitMenu';
import type { Database } from '@/integrations/supabase/types';
import { isRecruitmentCampaign } from '@/components/colaboradores/colaboradores-config';

type LeadRow = Database['public']['Tables']['leads']['Row'];

function slugifyCode(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

type ConvertLeadDialogProps = {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (collaborator: { id: string; code: string; name: string }) => void;
};

export function ConvertLeadDialog({ lead, open, onOpenChange, onCreated }: ConvertLeadDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [commission, setCommission] = useState('30');
  const [saving, setSaving] = useState(false);
  const [createdCollab, setCreatedCollab] = useState<{ id: string; code: string; name: string } | null>(null);

  const resetFromLead = () => {
    if (!lead) return;
    setName(lead.name ?? '');
    setCode(slugifyCode(lead.name ?? ''));
    setEmail(lead.email ?? '');
    setPhone(lead.phone ?? '');
    setCommission('30');
    setCreatedCollab(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (next && lead) resetFromLead();
    if (!next) setCreatedCollab(null);
    onOpenChange(next);
  };

  const handleCreate = async () => {
    const normalizedName = name.trim();
    const normalizedCode = slugifyCode(code || name);
    if (!normalizedName || normalizedCode.length < 3) {
      toast({ title: 'Nombre y código válidos requeridos', variant: 'destructive' });
      return;
    }
    const commissionValue = Number.parseFloat(commission.replace(',', '.'));
    if (!Number.isFinite(commissionValue) || commissionValue < 0) {
      toast({ title: 'Comisión inválida', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('collaborators')
        .insert({
          name: normalizedName,
          code: normalizedCode,
          commission_per_converted_eur: Number(commissionValue.toFixed(2)),
          email: email.trim() || null,
          phone: phone.trim() || null,
          notes: lead ? `Convertido desde lead ${lead.id}` : null,
        })
        .select('id, code, name')
        .single();

      if (error) throw error;

      if (lead?.id) {
        await supabase
          .from('leads')
          .update({ status: 'converted', updated_at: new Date().toISOString() })
          .eq('id', lead.id);
      }

      setCreatedCollab(data);
      onCreated?.(data);
      toast({ title: 'Colaborador creado', description: 'Genera el kit de enlaces y QR abajo.' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo crear el colaborador',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convertir lead → colaborador</DialogTitle>
          <DialogDescription>
            Crea un colaborador activo a partir de un lead de reclutamiento. El lead se marcará como convertido.
          </DialogDescription>
        </DialogHeader>

        {createdCollab ? (
          <div className="space-y-4 py-2">
            <p className="text-sm">
              <span className="font-medium">{createdCollab.name}</span> creado con código{' '}
              <code className="text-xs bg-muted px-1 rounded">{createdCollab.code}</code>
            </p>
            <CollaboratorKitMenu
              collaboratorId={createdCollab.id}
              code={createdCollab.code}
              name={createdCollab.name}
            />
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Cerrar</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Código URL</Label>
                <Input value={code} onChange={(e) => setCode(slugifyCode(e.target.value))} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Comisión por convertido (€)</Label>
                <Input value={commission} onChange={(e) => setCommission(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void handleCreate()} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Crear colaborador
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function isRecruitmentLead(lead: LeadRow): boolean {
  return lead.source === 'web_form' && isRecruitmentCampaign(lead.campaign);
}
