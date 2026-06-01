import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Info, BadgeEuro, Wallet, FileCheck2, CheckCircle2 } from 'lucide-react';
import { CollaboratorPayoutsSection } from './CollaboratorPayoutsSection';
import { CollaboratorInvoicesSection } from './CollaboratorInvoicesSection';

type CollaboratorPaymentsSectionProps = {
  collaboratorId: string;
  dateFrom?: string;
  dateTo?: string;
  onCreatePayout?: () => void;
  creatingPayout?: boolean;
};

type PaymentCounts = {
  pendingToSettle: number;
  pendingPayouts: number;
  invoicesToReview: number;
  paidPayouts: number;
};

const EMPTY_COUNTS: PaymentCounts = {
  pendingToSettle: 0,
  pendingPayouts: 0,
  invoicesToReview: 0,
  paidPayouts: 0,
};

export function CollaboratorPaymentsSection({
  collaboratorId,
  dateFrom,
  dateTo,
  onCreatePayout,
  creatingPayout,
}: CollaboratorPaymentsSectionProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [counts, setCounts] = useState<PaymentCounts>(EMPTY_COUNTS);

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  const fetchCounts = useCallback(async () => {
    try {
      // 1) Ventas cerradas (comisionables) pendientes de incluir en una liquidación.
      const { data: eligible } = await supabase
        .from('leads')
        .select('id')
        .eq('collaborator_id', collaboratorId)
        .not('commission_eligible_at', 'is', null);
      const eligibleIds = (eligible ?? []).map((l) => l.id);
      let pendingToSettle = 0;
      if (eligibleIds.length > 0) {
        const { data: paidLeads } = await supabase
          .from('collaborator_payout_leads')
          .select('lead_id')
          .in('lead_id', eligibleIds);
        const paid = new Set((paidLeads ?? []).map((r) => r.lead_id));
        pendingToSettle = eligibleIds.filter((id) => !paid.has(id)).length;
      }

      // 2) Liquidaciones pendientes / 4) pagadas.
      const { data: payouts } = await supabase
        .from('collaborator_payouts')
        .select('status')
        .eq('collaborator_id', collaboratorId);
      const pendingPayouts = (payouts ?? []).filter((p) => p.status === 'pending').length;
      const paidPayouts = (payouts ?? []).filter((p) => p.status === 'paid').length;

      // 3) Facturas recibidas pendientes de revisar.
      const { data: invoices } = await supabase
        .from('collaborator_invoices')
        .select('status')
        .eq('collaborator_id', collaboratorId);
      const invoicesToReview = (invoices ?? []).filter((i) => i.status === 'submitted').length;

      setCounts({ pendingToSettle, pendingPayouts, invoicesToReview, paidPayouts });
    } catch {
      setCounts(EMPTY_COUNTS);
    }
  }, [collaboratorId]);

  useEffect(() => {
    void fetchCounts();
  }, [fetchCounts, refreshKey]);

  const steps = [
    {
      icon: BadgeEuro,
      title: 'Ventas cerradas pendientes',
      count: counts.pendingToSettle,
      hint: 'Clientes marcados como «venta cerrada» que aún no están en una liquidación.',
    },
    {
      icon: Wallet,
      title: 'Liquidaciones pendientes',
      count: counts.pendingPayouts,
      hint: 'Generadas, esperando que el colaborador suba su factura.',
    },
    {
      icon: FileCheck2,
      title: 'Facturas por revisar',
      count: counts.invoicesToReview,
      hint: 'Facturas recibidas que debes aprobar o rechazar.',
    },
    {
      icon: CheckCircle2,
      title: 'Pagadas',
      count: counts.paidPayouts,
      hint: 'Liquidaciones ya abonadas y registradas.',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Pasos guiados con contadores */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {i + 1}
                </span>
                <Icon className="h-3.5 w-3.5" />
                <span className="truncate">{step.title}</span>
              </div>
              <p className="mt-1 text-2xl font-semibold">{step.count}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{step.hint}</p>
            </div>
          );
        })}
      </div>

      {counts.pendingToSettle > 0 && onCreatePayout && (
        <Alert>
          <BadgeEuro className="h-4 w-4" />
          <AlertTitle>
            {counts.pendingToSettle} venta{counts.pendingToSettle === 1 ? '' : 's'} cerrada
            {counts.pendingToSettle === 1 ? '' : 's'} sin liquidar
          </AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Genera una liquidación para incluirlas y que el colaborador pueda facturar.</span>
            <Button size="sm" onClick={onCreatePayout} disabled={creatingPayout}>
              <Wallet className="h-4 w-4 mr-2" />
              {creatingPayout ? 'Generando...' : 'Generar liquidación'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Pagos siempre manuales</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            El CRM no realiza transferencias ni cobros automáticos. Sirve para calcular comisiones, recibir la factura
            del colaborador y registrar qué liquidaciones ya has pagado fuera del sistema.
          </p>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Marca «venta cerrada» en los clientes captados que se conviertan en contrato.</li>
            <li>Genera la liquidación con las ventas cerradas pendientes.</li>
            <li>El colaborador sube su factura desde el portal, vinculada a esa liquidación.</li>
            <li>Revisas y apruebas la factura recibida.</li>
            <li>Tras pagar por banco/transferencia, registras el pago aquí (la liquidación queda marcada como pagada).</li>
          </ol>
        </AlertDescription>
      </Alert>

      <CollaboratorPayoutsSection
        key={`payouts-${refreshKey}`}
        collaboratorId={collaboratorId}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onCreatePayout={onCreatePayout}
        creatingPayout={creatingPayout}
      />

      <CollaboratorInvoicesSection
        key={`invoices-${refreshKey}`}
        collaboratorId={collaboratorId}
        onPaymentRegistered={bumpRefresh}
      />
    </div>
  );
}
