import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserPlus, Upload } from 'lucide-react';
import { ALL_ENTRY_MODES, ENTRY_MODE_LABELS, type CollaboratorEntryMode } from '@/lib/collaborators/types';
import { fileToBase64 } from './portal-types';
import { isValidSpanishPhone } from '@/hooks/useColaboradoresLeadSubmit';

type PortalRegistrarClienteSectionProps = {
  sessionToken: string;
  onSubmitted: () => void;
};

export function PortalRegistrarClienteSection({ sessionToken, onSubmitted }: PortalRegistrarClienteSectionProps) {
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientMode, setClientMode] = useState<CollaboratorEntryMode>('upload');
  const [clientFile, setClientFile] = useState<File | null>(null);
  const [manualKwh, setManualKwh] = useState('');
  const [manualTotal, setManualTotal] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim() || submitting) return;
    if (!isValidSpanishPhone(clientPhone)) {
      toast({
        title: 'Teléfono no válido',
        description: 'Introduce un teléfono español de 9 dígitos (puede llevar +34).',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        access_token: sessionToken,
        name: clientName.trim(),
        phone: clientPhone.trim(),
        email: clientEmail.trim() || undefined,
        entry_mode: clientMode,
      };
      if (clientFile) {
        body.attachment_base64 = await fileToBase64(clientFile);
        body.attachment_name = clientFile.name;
      }
      if (clientMode === 'manual' && manualKwh && manualTotal) {
        body.manual_extraction = {
          consumption_kwh: Number.parseFloat(manualKwh.replace(',', '.')),
          total_factura: Number.parseFloat(manualTotal.replace(',', '.')),
        };
      }
      const res = await fetch('/api/collaborator-submit-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        analysis_status?: 'completed' | 'failed' | 'error' | 'skipped';
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Error al registrar cliente');
      if (json.analysis_status === 'failed' || json.analysis_status === 'error') {
        toast({
          title: 'Cliente registrado',
          description:
            'El cliente quedó registrado correctamente, pero el análisis automático de la factura no fue concluyente. El gestor lo revisará a mano.',
        });
      } else {
        toast({ title: 'Cliente registrado', description: 'El lead aparecerá en el CRM.' });
      }
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setClientFile(null);
      setManualKwh('');
      setManualTotal('');
      onSubmitted();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo registrar',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Registrar cliente
        </CardTitle>
        <CardDescription>Para clientes que no usan tu enlace. Adjunta factura o datos manuales.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void submitClient(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Email (opcional)</Label>
            <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Modo de entrada</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={clientMode}
              onChange={(e) => setClientMode(e.target.value as CollaboratorEntryMode)}
            >
              {ALL_ENTRY_MODES.map((m) => (
                <option key={m} value={m}>
                  {ENTRY_MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          {(clientMode === 'upload' || clientMode === 'auto') && (
            <div className="space-y-1">
              <Label>Factura (PDF/imagen)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setClientFile(e.target.files?.[0] ?? null)} />
            </div>
          )}
          {clientMode === 'manual' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>kWh consumo</Label>
                <Input value={manualKwh} onChange={(e) => setManualKwh(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Importe factura (€)</Label>
                <Input value={manualTotal} onChange={(e) => setManualTotal(e.target.value)} />
              </div>
            </div>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Enviar cliente
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
