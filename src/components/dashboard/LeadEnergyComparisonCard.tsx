import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Zap } from 'lucide-react';
import {
  formatEuro,
  formatSavingsPercent,
  type EnergyComparisonSummary,
} from '@/lib/leads/invoice-utils';

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completada',
  failed: 'Fallida',
  pending: 'Pendiente',
  processing: 'Pendiente',
};

type LeadEnergyComparisonCardProps = {
  comparison: EnergyComparisonSummary | null;
  loading?: boolean;
  compact?: boolean;
  /** Si se proporciona, muestra "Reanalizar factura" (hay adjunto disponible). */
  onReanalyze?: () => void;
  reanalyzing?: boolean;
};

function ReanalyzeButton({ onReanalyze, reanalyzing }: { onReanalyze: () => void; reanalyzing?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onReanalyze} disabled={reanalyzing} className="gap-1.5">
      {reanalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      {reanalyzing ? 'Analizando…' : 'Reanalizar factura'}
    </Button>
  );
}

export function LeadEnergyComparisonCard({
  comparison,
  loading,
  compact,
  onReanalyze,
  reanalyzing,
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
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-2">
        <p className="text-sm text-muted-foreground">
          Sin comparativa de ahorro registrada para este lead.
        </p>
        {onReanalyze && <ReanalyzeButton onReanalyze={onReanalyze} reanalyzing={reanalyzing} />}
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
        {onReanalyze && <ReanalyzeButton onReanalyze={onReanalyze} reanalyzing={reanalyzing} />}
      </div>
    );
  }

  if (comparison.status !== 'completed') {
    return (
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Comparativa de ahorro</span>
          <Badge variant="secondary">{statusLabel}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">El análisis aún no ha finalizado.</p>
        {onReanalyze && <ReanalyzeButton onReanalyze={onReanalyze} reanalyzing={reanalyzing} />}
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
      {!compact && onReanalyze && (
        <ReanalyzeButton onReanalyze={onReanalyze} reanalyzing={reanalyzing} />
      )}
    </div>
  );
}
