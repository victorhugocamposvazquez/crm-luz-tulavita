import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Plus, RefreshCw, Users, Link2, Wallet, CheckCircle2 } from 'lucide-react';

type CollaboratorRow = {
  id: string;
  code: string;
  name: string;
  commission_per_converted_eur: number;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type CollaboratorPayoutRow = {
  id: string;
  collaborator_id: string;
  period_from: string | null;
  period_to: string | null;
  leads_count: number;
  amount_total_eur: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  created_at: string;
  collaborators?: {
    name: string;
    code: string;
  } | null;
};

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

function createReferralToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(36).slice(2, 10)}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CollaboratorsManagement() {
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [statsByCampaign, setStatsByCampaign] = useState<Record<string, {
    total: number;
    contacted: number;
    qualified: number;
    converted: number;
    lost: number;
  }>>({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [creatingPayoutFor, setCreatingPayoutFor] = useState<string | null>(null);
  const [markingPayoutId, setMarkingPayoutId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [commissionPerConverted, setCommissionPerConverted] = useState('30');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [payouts, setPayouts] = useState<CollaboratorPayoutRow[]>([]);

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  const fetchCollaborators = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collaborators')
        .select('id, code, name, commission_per_converted_eur, email, phone, notes, is_active, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data as CollaboratorRow[]) ?? []);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los colaboradores',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(
    async (collaborators: CollaboratorRow[]) => {
      const campaigns = collaborators.map((row) => `collaborator:${row.code}`);
      if (campaigns.length === 0) {
        setStatsByCampaign({});
        return;
      }
      setStatsLoading(true);
      try {
        let query = supabase
          .from('leads')
          .select('status, campaign, created_at')
          .eq('source', 'collaborator_referral')
          .in('campaign', campaigns);

        if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00.000Z`);
        if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59.999Z`);

        const { data, error } = await query;
        if (error) throw error;

        const next: Record<string, { total: number; contacted: number; qualified: number; converted: number; lost: number }> = {};
        for (const row of collaborators) {
          const campaign = `collaborator:${row.code}`;
          next[campaign] = { total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
        }
        for (const lead of data ?? []) {
          const campaign = typeof lead.campaign === 'string' ? lead.campaign : null;
          if (!campaign || !next[campaign]) continue;
          next[campaign].total += 1;
          if (lead.status === 'contacted') next[campaign].contacted += 1;
          if (lead.status === 'qualified') next[campaign].qualified += 1;
          if (lead.status === 'converted') next[campaign].converted += 1;
          if (lead.status === 'lost') next[campaign].lost += 1;
        }
        setStatsByCampaign(next);
      } catch (err) {
        console.error(err);
        toast({
          title: 'Error',
          description: 'No se pudieron calcular las métricas de colaboradores',
          variant: 'destructive',
        });
      } finally {
        setStatsLoading(false);
      }
    },
    [dateFrom, dateTo]
  );

  const fetchPayouts = useCallback(async () => {
    setPayoutsLoading(true);
    try {
      const { data, error } = await supabase
        .from('collaborator_payouts')
        .select('id, collaborator_id, period_from, period_to, leads_count, amount_total_eur, status, paid_at, created_at, collaborators(name, code)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPayouts((data as CollaboratorPayoutRow[]) ?? []);
    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las liquidaciones',
        variant: 'destructive',
      });
    } finally {
      setPayoutsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCollaborators();
  }, [fetchCollaborators]);

  useEffect(() => {
    void fetchPayouts();
  }, [fetchPayouts]);

  useEffect(() => {
    if (rows.length === 0) {
      setStatsByCampaign({});
      return;
    }
    void fetchStats(rows);
  }, [rows, fetchStats]);

  const createPendingPayout = async (collaborator: CollaboratorRow) => {
    setCreatingPayoutFor(collaborator.id);
    try {
      let leadsQuery = supabase
        .from('leads')
        .select('id, created_at')
        .eq('collaborator_id', collaborator.id)
        .eq('status', 'converted');

      if (dateFrom) leadsQuery = leadsQuery.gte('created_at', `${dateFrom}T00:00:00.000Z`);
      if (dateTo) leadsQuery = leadsQuery.lte('created_at', `${dateTo}T23:59:59.999Z`);

      const { data: convertedLeads, error: convertedError } = await leadsQuery;
      if (convertedError) throw convertedError;

      const convertedIds = (convertedLeads ?? []).map((lead) => lead.id);
      if (convertedIds.length === 0) {
        toast({ title: 'Sin convertidos pendientes para este rango' });
        return;
      }

      const { data: alreadyPaidRows, error: paidError } = await supabase
        .from('collaborator_payout_leads')
        .select('lead_id')
        .in('lead_id', convertedIds);
      if (paidError) throw paidError;

      const alreadyPaid = new Set((alreadyPaidRows ?? []).map((row) => row.lead_id));
      const pendingLeadIds = convertedIds.filter((id) => !alreadyPaid.has(id));

      if (pendingLeadIds.length === 0) {
        toast({ title: 'Todo liquidado', description: 'No hay convertidos pendientes de pago para este colaborador.' });
        return;
      }

      const amountPerLead = collaborator.commission_per_converted_eur;
      const totalAmount = Number((pendingLeadIds.length * amountPerLead).toFixed(2));
      const { data: authData } = await supabase.auth.getUser();

      const { data: payout, error: payoutError } = await supabase
        .from('collaborator_payouts')
        .insert({
          collaborator_id: collaborator.id,
          period_from: dateFrom || null,
          period_to: dateTo || null,
          leads_count: pendingLeadIds.length,
          amount_total_eur: totalAmount,
          status: 'pending',
          created_by: authData.user?.id ?? null,
        })
        .select('id')
        .single();

      if (payoutError) throw payoutError;

      const lines = pendingLeadIds.map((leadId) => ({
        payout_id: payout.id,
        collaborator_id: collaborator.id,
        lead_id: leadId,
        amount_eur: amountPerLead,
      }));

      const { error: linesError } = await supabase.from('collaborator_payout_leads').insert(lines);
      if (linesError) {
        await supabase.from('collaborator_payouts').delete().eq('id', payout.id);
        throw linesError;
      }

      toast({
        title: 'Liquidación creada',
        description: `${pendingLeadIds.length} convertidos incluidos · ${totalAmount.toFixed(2)} €`,
      });
      await fetchPayouts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear la liquidación';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setCreatingPayoutFor(null);
    }
  };

  const markPayoutAsPaid = async (payoutId: string) => {
    setMarkingPayoutId(payoutId);
    try {
      const { error } = await supabase
        .from('collaborator_payouts')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', payoutId);
      if (error) throw error;
      toast({ title: 'Liquidación marcada como pagada' });
      await fetchPayouts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar la liquidación';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setMarkingPayoutId(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = name.trim();
    const normalizedCode = slugifyCode(code || name);
    if (!normalizedName) {
      toast({ title: 'Nombre requerido', variant: 'destructive' });
      return;
    }
    if (!normalizedCode || normalizedCode.length < 3) {
      toast({
        title: 'Código inválido',
        description: 'El código debe tener al menos 3 caracteres (a-z, 0-9, -, _).',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const commissionValue = Number.parseFloat(commissionPerConverted.replace(',', '.'));
      if (!Number.isFinite(commissionValue) || commissionValue < 0) {
        toast({
          title: 'Comisión inválida',
          description: 'Introduce una comisión válida en euros (>= 0).',
          variant: 'destructive',
        });
        setSaving(false);
        return;
      }
      const { error } = await supabase.from('collaborators').insert({
        name: normalizedName,
        code: normalizedCode,
        commission_per_converted_eur: Number(commissionValue.toFixed(2)),
        email: email.trim() || null,
        phone: phone.trim() || null,
        notes: notes.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Colaborador creado' });
      setName('');
      setCode('');
      setEmail('');
      setPhone('');
      setNotes('');
      setCommissionPerConverted('30');
      void fetchCollaborators();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    try {
      const { error } = await supabase.from('collaborators').update({ is_active: next }).eq('id', id);
      if (error) throw error;
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Enlace copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const createSignedLink = async (collaboratorId: string, entryMode: 'auto' | 'upload') => {
    const token = createReferralToken();
    const { error } = await supabase.from('collaborator_referral_links').insert({
      collaborator_id: collaboratorId,
      token,
      entry_mode: entryMode,
      is_active: true,
      expires_at: null,
    });
    if (error) throw error;
    return `${baseUrl}/ahorra-factura-luz?ref=${encodeURIComponent(token)}`;
  };

  const copyGeneratedLink = async (collaboratorId: string, entryMode: 'auto' | 'upload') => {
    try {
      const link = await createSignedLink(collaboratorId, entryMode);
      await copyToClipboard(link);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo generar el enlace';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const totals = useMemo(() => {
    const values = Object.values(statsByCampaign);
    return values.reduce(
      (acc, v) => {
        acc.total += v.total;
        acc.contacted += v.contacted;
        acc.qualified += v.qualified;
        acc.converted += v.converted;
        acc.lost += v.lost;
        return acc;
      },
      { total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 }
    );
  }, [statsByCampaign]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Zona de colaboradores
          </CardTitle>
          <CardDescription>
            Crea colaboradores con código propio para atribuir leads y compartir enlaces de captación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="collab-name">Nombre</Label>
              <Input
                id="collab-name"
                placeholder="Ej. Marta Pérez"
                value={name}
                onChange={(e) => {
                  const nextName = e.target.value;
                  setName(nextName);
                  if (!code.trim()) setCode(slugifyCode(nextName));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collab-code">Código (URL)</Label>
              <Input
                id="collab-code"
                placeholder="ej. marta-zona-sur"
                value={code}
                onChange={(e) => setCode(slugifyCode(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collab-email">Email (opcional)</Label>
              <Input id="collab-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collab-phone">Teléfono (opcional)</Label>
              <Input id="collab-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="collab-notes">Notas (opcional)</Label>
              <Input id="collab-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="collab-commission">Comisión por convertido (€)</Label>
              <Input
                id="collab-commission"
                value={commissionPerConverted}
                onChange={(e) => setCommissionPerConverted(e.target.value)}
                inputMode="decimal"
                placeholder="30"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit" disabled={saving}>
                <Plus className="h-4 w-4 mr-2" />
                {saving ? 'Guardando...' : 'Crear colaborador'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void fetchCollaborators()} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Recargar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colaboradores</CardTitle>
          <CardDescription>
            Activa/desactiva colaboradores y copia el enlace público o de subida directa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="collab-date-from">Desde</Label>
              <Input id="collab-date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="collab-date-to">Hasta</Label>
              <Input id="collab-date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="md:col-span-3 flex items-end gap-2">
              <Button variant="outline" onClick={() => void fetchStats(rows)} disabled={statsLoading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {statsLoading ? 'Calculando...' : 'Actualizar métricas'}
              </Button>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                  }}
                >
                  Limpiar fechas
                </Button>
              )}
            </div>
          </div>

          <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Leads</p>
              <p className="text-xl font-semibold">{totals.total}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Contactados</p>
              <p className="text-xl font-semibold">{totals.contacted}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Calificados</p>
              <p className="text-xl font-semibold">{totals.qualified}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Convertidos</p>
              <p className="text-xl font-semibold">{totals.converted}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Conversión</p>
              <p className="text-xl font-semibold">
                {totals.total > 0 ? `${((totals.converted / totals.total) * 100).toFixed(1)}%` : '0.0%'}
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Contactados</TableHead>
                <TableHead className="text-right">Calificados</TableHead>
                <TableHead className="text-right">Convertidos</TableHead>
                <TableHead className="text-right">Conv.%</TableHead>
                <TableHead className="text-right">Comisión estimada</TableHead>
                <TableHead>Liquidación</TableHead>
                <TableHead>Enlace landing</TableHead>
                <TableHead>Enlace directo factura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={12}>Cargando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-muted-foreground">
                    Aun no hay colaboradores.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const campaign = `collaborator:${row.code}`;
                  const stats = statsByCampaign[campaign] ?? { total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
                  const conversion = stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : '0.0';
                  const estimatedCommission = stats.converted * row.commission_per_converted_eur;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        {(row.email || row.phone) && (
                          <p className="text-xs text-muted-foreground">
                            {[row.email, row.phone].filter(Boolean).join(' - ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={row.is_active} onCheckedChange={(next) => void toggleActive(row.id, next)} />
                          <span className="text-sm">{row.is_active ? 'Activo' : 'Inactivo'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{stats.total}</TableCell>
                      <TableCell className="text-right">{stats.contacted}</TableCell>
                      <TableCell className="text-right">{stats.qualified}</TableCell>
                      <TableCell className="text-right font-medium">{stats.converted}</TableCell>
                      <TableCell className="text-right">{conversion}%</TableCell>
                      <TableCell className="text-right">
                        {estimatedCommission.toFixed(2)} €
                        <p className="text-[11px] text-muted-foreground">
                          {row.commission_per_converted_eur.toFixed(2)} €/conv.
                        </p>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void createPendingPayout(row)}
                          disabled={creatingPayoutFor === row.id}
                        >
                          <Wallet className="h-3.5 w-3.5 mr-2" />
                          {creatingPayoutFor === row.id ? 'Creando...' : 'Liquidar pendientes'}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => void copyGeneratedLink(row.id, 'auto')}>
                          <Link2 className="h-3.5 w-3.5 mr-2" />
                          Generar y copiar
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => void copyGeneratedLink(row.id, 'upload')}>
                          <Link2 className="h-3.5 w-3.5 mr-2" />
                          Generar y copiar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Liquidaciones</CardTitle>
          <CardDescription>
            Historial de liquidaciones generadas. Cada lead convertido se liquida una sola vez.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutsLoading ? (
                <TableRow>
                  <TableCell colSpan={7}>Cargando liquidaciones...</TableCell>
                </TableRow>
              ) : payouts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">
                    Aún no hay liquidaciones.
                  </TableCell>
                </TableRow>
              ) : (
                payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{formatDateTime(payout.created_at)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{payout.collaborators?.name ?? payout.collaborator_id}</div>
                      {payout.collaborators?.code && (
                        <p className="text-xs text-muted-foreground">{payout.collaborators.code}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {payout.period_from || payout.period_to
                        ? `${payout.period_from ?? '...'} -> ${payout.period_to ?? '...'}`
                        : 'Sin filtro'}
                    </TableCell>
                    <TableCell className="text-right">{payout.leads_count}</TableCell>
                    <TableCell className="text-right font-medium">{Number(payout.amount_total_eur).toFixed(2)} €</TableCell>
                    <TableCell>
                      <Badge variant={payout.status === 'paid' ? 'default' : 'secondary'}>
                        {payout.status === 'paid' ? 'Pagada' : payout.status === 'pending' ? 'Pendiente' : 'Cancelada'}
                      </Badge>
                      {payout.status === 'paid' && payout.paid_at && (
                        <p className="text-xs text-muted-foreground mt-1">{formatDateTime(payout.paid_at)}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      {payout.status === 'pending' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void markPayoutAsPaid(payout.id)}
                          disabled={markingPayoutId === payout.id}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                          {markingPayoutId === payout.id ? 'Guardando...' : 'Marcar pagada'}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
