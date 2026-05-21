import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { CollaboratorPayoutsSection } from './CollaboratorPayoutsSection';
import { CollaboratorInvoicesSection } from './CollaboratorInvoicesSection';

type CollaboratorPaymentsSectionProps = {
  collaboratorId: string;
  dateFrom?: string;
  dateTo?: string;
  onCreatePayout?: () => void;
  creatingPayout?: boolean;
};

export function CollaboratorPaymentsSection({
  collaboratorId,
  dateFrom,
  dateTo,
  onCreatePayout,
  creatingPayout,
}: CollaboratorPaymentsSectionProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const bumpRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Pagos siempre manuales</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            El CRM no realiza transferencias ni cobros automáticos. Sirve para calcular comisiones, recibir la factura
            del colaborador y registrar qué liquidaciones ya has pagado fuera del sistema.
          </p>
          <ol className="list-decimal list-inside text-sm space-y-1">
            <li>Genera la liquidación con los convertidos pendientes.</li>
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
