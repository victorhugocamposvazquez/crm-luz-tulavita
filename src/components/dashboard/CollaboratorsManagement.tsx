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
import { Copy, Plus, RefreshCw, Users } from 'lucide-react';

type CollaboratorRow = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
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
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const baseUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin;
  }, []);

  const fetchCollaborators = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('collaborators')
        .select('id, code, name, email, phone, notes, is_active, created_at')
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

  useEffect(() => {
    void fetchCollaborators();
  }, [fetchCollaborators]);

  useEffect(() => {
    if (rows.length === 0) {
      setStatsByCampaign({});
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
      const { error } = await supabase.from('collaborators').insert({
        name: normalizedName,
        code: normalizedCode,
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

  const buildLandingLink = (codeValue: string) =>
    `${baseUrl}/ahorra-factura-luz?collaborator=${encodeURIComponent(codeValue)}`;
  const buildDirectUploadLink = (codeValue: string) =>
    `${baseUrl}/ahorra-factura-luz?collaborator=${encodeURIComponent(codeValue)}&entry=upload`;

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
                <TableHead>Enlace landing</TableHead>
                <TableHead>Enlace directo factura</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10}>Cargando...</TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    Aun no hay colaboradores.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const landing = buildLandingLink(row.code);
                  const direct = buildDirectUploadLink(row.code);
                  const campaign = `collaborator:${row.code}`;
                  const stats = statsByCampaign[campaign] ?? { total: 0, contacted: 0, qualified: 0, converted: 0, lost: 0 };
                  const conversion = stats.total > 0 ? ((stats.converted / stats.total) * 100).toFixed(1) : '0.0';
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
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => void copyToClipboard(landing)}>
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          Copiar
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={() => void copyToClipboard(direct)}>
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          Copiar
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
    </div>
  );
}
