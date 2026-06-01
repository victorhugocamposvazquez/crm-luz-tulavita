import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CircleSlash,
  HelpCircle,
  ExternalLink,
  Activity,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type ServiceStatus = 'operational' | 'degraded' | 'down' | 'not_configured' | 'unknown';

type ServiceResult = {
  id: string;
  name: string;
  category: string;
  status: ServiceStatus;
  configured: boolean;
  detail: string;
  latencyMs: number | null;
  docsUrl?: string;
};

const STATUS_META: Record<
  ServiceStatus,
  { label: string; badgeClass: string; dotClass: string; Icon: typeof CheckCircle2; iconClass: string }
> = {
  operational: {
    label: 'Operativo',
    badgeClass: 'bg-green-100 text-green-800 hover:bg-green-100',
    dotClass: 'bg-green-500',
    Icon: CheckCircle2,
    iconClass: 'text-green-600',
  },
  degraded: {
    label: 'Atención',
    badgeClass: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
    dotClass: 'bg-amber-500',
    Icon: AlertTriangle,
    iconClass: 'text-amber-600',
  },
  down: {
    label: 'Caído',
    badgeClass: 'bg-red-100 text-red-800 hover:bg-red-100',
    dotClass: 'bg-red-500',
    Icon: XCircle,
    iconClass: 'text-red-600',
  },
  not_configured: {
    label: 'Sin configurar',
    badgeClass: 'bg-gray-100 text-gray-700 hover:bg-gray-100',
    dotClass: 'bg-gray-400',
    Icon: CircleSlash,
    iconClass: 'text-gray-500',
  },
  unknown: {
    label: 'Desconocido',
    badgeClass: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
    dotClass: 'bg-slate-400',
    Icon: HelpCircle,
    iconClass: 'text-slate-500',
  },
};

export default function ServiceStatusManagement() {
  const [services, setServices] = useState<ServiceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sesión no válida. Vuelve a iniciar sesión.');

      const res = await fetch('/api/admin-service-status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        services?: ServiceResult[];
        checkedAt?: string;
      };
      if (!res.ok || !json.success) throw new Error(json.error ?? 'No se pudo obtener el estado');
      setServices(json.services ?? []);
      setCheckedAt(json.checkedAt ?? new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al consultar el estado de los servicios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = services.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ServiceStatus, number>,
  );
  const hasDown = (counts.down ?? 0) > 0;
  const hasDegraded = (counts.degraded ?? 0) > 0;
  const globalLabel = hasDown
    ? 'Hay servicios caídos'
    : hasDegraded
      ? 'Algún servicio requiere atención'
      : services.length > 0
        ? 'Todos los servicios operativos'
        : 'Sin datos';
  const globalClass = hasDown ? 'text-red-600' : hasDegraded ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7" />
            Estado de servicios
          </h1>
          <p className="text-muted-foreground">
            Salud en tiempo real de los servicios externos que usa el CRM.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className={`text-lg ${globalClass}`}>{globalLabel}</CardTitle>
            {checkedAt && (
              <span className="text-xs text-muted-foreground">
                Última comprobación: {format(new Date(checkedAt), "d MMM yyyy, HH:mm:ss", { locale: es })}
              </span>
            )}
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Card className="border-red-200">
          <CardContent className="pt-6 text-sm text-red-700 flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {loading && services.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-5 w-32 bg-muted rounded" />
                <div className="h-4 w-48 bg-muted rounded mt-2" />
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full bg-muted rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service) => {
            const meta = STATUS_META[service.status];
            const Icon = meta.Icon;
            return (
              <Card key={service.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                      <CardTitle className="text-base">{service.name}</CardTitle>
                    </div>
                    <Badge className={meta.badgeClass} variant="secondary">
                      {meta.label}
                    </Badge>
                  </div>
                  <CardDescription>{service.category}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2 text-sm">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.iconClass}`} />
                    <span className="text-muted-foreground">{service.detail}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {service.latencyMs != null ? `Latencia: ${service.latencyMs} ms` : 'Latencia: —'}
                    </span>
                    {service.docsUrl && (
                      <a
                        href={service.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Panel <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
