/**
 * Ajuste: persona responsable de colaboradores. A ella se asignan por defecto
 * los leads de reclutamiento y de captación (owner_id) en el servidor.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { UserCog } from 'lucide-react';

const NONE = '__none__';

type UserOption = { id: string; label: string };

export function CollaboratorManagerSetting() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [managerId, setManagerId] = useState<string>(NONE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['commercial', 'admin']);
      const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
      let options: UserOption[] = [];
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', ids)
          .order('first_name');
        options = (profs ?? []).map((p) => ({
          id: p.id,
          label:
            `${[p.first_name, p.last_name].filter(Boolean).join(' ')}`.trim() || p.email || p.id,
        }));
      }
      setUsers(options);

      const { data: settings } = await supabase
        .from('collaborator_settings')
        .select('collaborator_manager_id')
        .eq('id', 1)
        .maybeSingle();
      setManagerId(settings?.collaborator_manager_id ?? NONE);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const value = managerId === NONE ? null : managerId;
      const { error } = await supabase
        .from('collaborator_settings')
        .update({ collaborator_manager_id: value, updated_at: new Date().toISOString() })
        .eq('id', 1);
      if (error) throw error;
      toast({ title: 'Responsable actualizado' });
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : 'No se pudo guardar',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-5 w-5" />
          Responsable de colaboradores
        </CardTitle>
        <CardDescription>
          Los leads de reclutamiento y de captación por colaborador se asignan automáticamente a
          esta persona.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={managerId} onValueChange={setManagerId} disabled={loading || saving}>
            <SelectTrigger className="sm:w-80">
              <SelectValue placeholder={loading ? 'Cargando…' : 'Sin asignar'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin asignar</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
        {users.length === 0 && !loading && (
          <p className="mt-2 text-xs text-muted-foreground">
            No hay usuarios con rol comercial o admin para asignar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
