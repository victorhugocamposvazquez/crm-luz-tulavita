import { Badge } from '@/components/ui/badge';
import { Zap } from 'lucide-react';
import {
  formatEuro,
  formatSavingsPercent,
  type EnergyComparisonSummary,
} from '@/lib/leads/invoice-utils';

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completada',
  failed: 'Fallida',
  pending: 'Pendiente',
};

type LeadEnergyComparisonCardProps = {
  comparison: EnergyComparisonSummary | null;
  loading?: boolean;
  compact?: boolean;
};

export function LeadEnergyComparisonCard({
  comparison,
  loading,
  compact,
}: LeadEnergyComparisonCardProps) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        Cargando comparativa…
      </div>
    );
  }

  if (!comparison) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        Sin comparativa de ahorro registrada para este lead.
      </div>
    );
  }

  const statusLabel = STATUS_LABELS[comparison.status] ?? comparison.status;

  if (comparison.status === 'failed') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-destructive" />
          <span className="font-medium text-sm">Comparativa de ahorro</span>
          <Badge variant="destructive">{statusLabel}</Badge>
        </div>
        {comparison.error_message && (
          <p className="text-sm text-muted-foreground">{comparison.error_message}</p>
        )}
      </div>
    );
  }

  if (comparison.status !== 'completed') {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Comparativa de ahorro</span>
          <Badge variant="secondary">{statusLabel}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">El análisis aún no ha finalizado.</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border bg-emerald-50/50 border-emerald-200/60 ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Zap className="h-4 w-4 text-emerald-700" />
        <span className="font-medium text-sm">Comparativa de ahorro</span>
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200">
          {statusLabel}
        </Badge>
        {comparison.prudent_mode && (
          <Badge variant="outline" className="text-xs">
            Estimación prudente
          </Badge>
        )}
      </div>
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2'}`}>
        <div>
          <p className="text-xs text-muted-foreground">Ahorro estimado</p>
          <p className="text-lg font-semibold text-emerald-800">
            {formatSavingsPercent(comparison.estimated_savings_percentage)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatEuro(comparison.estimated_savings_amount)}/mes aprox.
          </p>
        </div>
        {!compact && (
          <>
            <div>
              <p className="text-xs text-muted-foreground">Compañía actual</p>
              <p className="text-sm font-medium">{comparison.current_company ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                {formatEuro(comparison.current_monthly_cost)}/mes
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Mejor oferta detectada</p>
              <p className="text-sm font-medium">{comparison.best_offer_company ?? '—'}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
