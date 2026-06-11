import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatSavingsPercent } from '@/lib/leads/invoice-utils';
import { CLIENT_STATUS_LABELS, type PortalCapturedClient } from './portal-types';

type PortalClientesSectionProps = {
  clients: PortalCapturedClient[];
};

export function PortalClientesSection({ clients }: PortalClientesSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Mis clientes captados
        </CardTitle>
        <CardDescription>
          Estado de tus referidos y resultado del análisis de factura cuando está disponible.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no tienes clientes registrados.</p>
        ) : (
          <div className="space-y-3">
            {clients.map((client) => (
              <div key={client.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{client.name ?? 'Sin nombre'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[client.phone, client.email].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {client.commission_eligible && (
                      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border border-emerald-200">
                        Venta cerrada
                      </Badge>
                    )}
                    <Badge variant="secondary">{CLIENT_STATUS_LABELS[client.status] ?? client.status}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{format(new Date(client.created_at), 'd MMM yyyy', { locale: es })}</span>
                  {client.has_invoice ? (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      Factura recibida
                    </span>
                  ) : (
                    <span>Sin factura</span>
                  )}
                  {client.comparison_status === 'completed' && (
                    <span className="font-medium text-emerald-700">
                      Ahorro est.: {formatSavingsPercent(client.estimated_savings_percentage)}
                    </span>
                  )}
                  {client.comparison_status === 'failed' && (
                    <span className="text-destructive">Análisis no disponible</span>
                  )}
                  {client.comparison_status &&
                    client.comparison_status !== 'completed' &&
                    client.comparison_status !== 'failed' && <span>Análisis en proceso</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
