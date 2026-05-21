import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Plus, RefreshCw, Users, Link2, ExternalLink, ChevronRight, Megaphone } from 'lucide-react';
import { RecruitmentLeadsSection } from './RecruitmentLeadsSection';
import { ConvertLeadDialog } from './ConvertLeadDialog';
import { CollaboratorDetailView, type CollaboratorRow } from './CollaboratorDetailView';
import { COLABORADORES_RECRUITMENT_ROUTE } from '@/components/colaboradores/colaboradores-config';
import type { Database } from '@/integrations/supabase/types';

type RecruitmentLeadRow = Database['public']['Tables']['leads']['Row'];

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

export default function CollaboratorsManagement() {
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [statsByCollaborator, setStatsByCollaborator] = useState<
    Record<string, { total: number; converted: number }>
  >({});
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [commissionPerConverted, setCommissionPerConverted] = useState('30');
  const [selectedCollaborator, setSelectedCollaborator] = useState<CollaboratorRow | null>(null);
  const [convertLead, setConvertLead] = useState<RecruitmentLeadRow | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  const recruitmentUrl = `${baseUrl}${COLABORADORES_RECRUITMENT_ROUTE}/`;

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

  const refreshCollaborators = useCallback(async () => {
    await fetchCollaborators();
    if (selectedCollaborator) {
      const { data } = await supabase
        .from('collaborators')
        .select('id, code, name, commission_per_converted_eur, email, phone, notes, is_active, created_at')
        .eq('id', selectedCollaborator.id)
        .maybeSingle();
      if (data) setSelectedCollaborator(data as CollaboratorRow);
    }
  }, [fetchCollaborators, selectedCollaborator]);

  const fetchStats = useCallback(async (collaborators: CollaboratorRow[]) => {
    if (collaborators.length === 0) {
      setStatsByCollaborator({});
      return;
    }
    setStatsLoading(true);
    try {
      const ids = collaborators.map((c) => c.id);
      const { data, error } = await supabase
        .from('leads')
        .select('status, collaborator_id')
        .eq('source', 'collaborator_referral')
        .in('collaborator_id', ids);

      if (error) throw error;

      const next: Record<string, { total: number; converted: number }> = {};
      for (const c of collaborators) {
        next[c.id] = { total: 0, converted: 0 };
      }
      for (const lead of data ?? []) {
        const cid = lead.collaborator_id;
        if (!cid || !next[cid]) continue;
        next[cid].total += 1;
        if (lead.status === 'converted') next[cid].converted += 1;
      }
      setStatsByCollaborator(next);
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCollaborators();
  }, [fetchCollaborators]);

  useEffect(() => {
    if (rows.length === 0) {
      setStatsByCollaborator({});
      return;
    }
    void fetchStats(rows);
  }, [rows, fetchStats]);

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

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'Enlace copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const openConvertLead = (lead: RecruitmentLeadRow) => {
    setConvertLead(lead);
    setConvertOpen(true);
  };

  if (selectedCollaborator) {
    return (
      <CollaboratorDetailView
        collaborator={selectedCollaborator}
        onBack={() => setSelectedCollaborator(null)}
        onUpdated={() => void refreshCollaborators()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Colaboradores
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gestiona colaboradores activos o captación y reclutamiento desde las pestañas inferiores.
        </p>
      </div>

      <Tabs defaultValue="listado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="listado" className="gap-2">
            <Users className="h-4 w-4" />
            Listado
          </TabsTrigger>
          <TabsTrigger value="marketing" className="gap-2">
            <Megaphone className="h-4 w-4" />
            Marketing
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listado">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Colaboradores activos</CardTitle>
                  <CardDescription>
                    {rows.length} colaborador{rows.length === 1 ? '' : 'es'} registrado{rows.length === 1 ? '' : 's'}.
                    Entra en cada ficha para ver clientes, liquidaciones y facturas.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void fetchCollaborators()} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Recargar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Clientes</TableHead>
                    <TableHead className="text-right">Convertidos</TableHead>
                    <TableHead className="text-right">Comisión/conv.</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7}>Cargando...</TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground">
                        Aún no hay colaboradores. Créalos desde la pestaña Marketing.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => {
                      const stats = statsByCollaborator[row.id] ?? { total: 0, converted: 0 };
                      return (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedCollaborator(row)}
                        >
                          <TableCell>
                            <div className="font-medium">{row.name}</div>
                            {(row.email || row.phone) && (
                              <p className="text-xs text-muted-foreground">
                                {[row.email, row.phone].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{row.code}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.is_active ? 'default' : 'secondary'}>
                              {row.is_active ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{statsLoading ? '…' : stats.total}</TableCell>
                          <TableCell className="text-right font-medium">
                            {statsLoading ? '…' : stats.converted}
                          </TableCell>
                          <TableCell className="text-right">{row.commission_per_converted_eur.toFixed(2)} €</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCollaborator(row);
                              }}
                            >
                              Ver ficha
                              <ChevronRight className="h-4 w-4 ml-1" />
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
        </TabsContent>

        <TabsContent value="marketing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nuevo colaborador</CardTitle>
              <CardDescription>
                Alta manual de un colaborador con código propio para atribuir leads y compartir enlaces.
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
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                Reclutamiento de colaboradores
              </CardTitle>
              <CardDescription>
                Prospectos desde la landing pública /hazte-colaborador. Convierte un lead en colaborador activo cuando proceda.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Landing «Hazte colaborador»</p>
                  <p className="break-all text-xs text-muted-foreground">{recruitmentUrl}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void copyToClipboard(recruitmentUrl)}>
                    Copiar enlace
                  </Button>
                  <Button type="button" variant="ghost" size="sm" asChild>
                    <a href={`${COLABORADORES_RECRUITMENT_ROUTE}/`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1 h-4 w-4" />
                      Abrir
                    </a>
                  </Button>
                </div>
              </div>

              <RecruitmentLeadsSection onConvertLead={openConvertLead} embedded />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConvertLeadDialog
        lead={convertLead}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onCreated={() => void fetchCollaborators()}
      />
    </div>
  );
}
