/**
 * Pantalla de resultado del ahorro estimado (sin animación: el porcentaje se muestra al instante).
 */

const LEGAL_TEXT = 'Cálculo estimado basado en los datos de tu factura.';

export interface EnergyComparisonData {
  status: string;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  current_monthly_cost?: number | null;
  prudent_mode?: boolean;
}

/** Un decimal, alineado con el simulador / `energy_comparisons.estimated_savings_percentage`. */
function roundPercentOneDecimal(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function resolveSavingsPercent(data: EnergyComparisonData): number {
  if (
    data.estimated_savings_percentage != null &&
    Number.isFinite(data.estimated_savings_percentage) &&
    data.estimated_savings_percentage > 0
  ) {
    return roundPercentOneDecimal(data.estimated_savings_percentage);
  }

  const currentMonthlyCost = data.current_monthly_cost;
  const savingsAmount = data.estimated_savings_amount;
  if (
    currentMonthlyCost != null &&
    savingsAmount != null &&
    Number.isFinite(currentMonthlyCost) &&
    Number.isFinite(savingsAmount) &&
    currentMonthlyCost > 0
  ) {
    return Math.max(0, roundPercentOneDecimal((savingsAmount / currentMonthlyCost) * 100));
  }

  return roundPercentOneDecimal(data.estimated_savings_percentage);
}

function formatPercentLabel(p: number): string {
  const r = Math.round(p * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function EnergySavingsResult({ data }: { data: EnergyComparisonData }) {
  if (data.status !== 'completed') {
    return (
      <p className="text-lg text-gray-600">
        Hemos recibido tu factura. Un asesor revisará los datos y te contactará con una estimación personalizada.
      </p>
    );
  }

  const percent = resolveSavingsPercent(data);
  const prudent = data.prudent_mode === true;
  const showExact = percent > 0;

  return (
    <div className="space-y-4 bg-white rounded-xl p-4 sm:p-6 border border-gray-100">
      {showExact && (
        <div className="space-y-2 text-center w-full min-w-0 px-1">
          <p className="text-2xl sm:text-4xl break-words text-[#26606b]">
            <span className="font-light">¡Podrías </span>
            <strong className="font-bold">ahorrar hasta un {formatPercentLabel(percent)}%</strong>
            <span className="font-light"> con una mejor tarifa!</span>
          </p>
          <p className="text-sm text-gray-500">{LEGAL_TEXT}</p>
          {prudent && (
            <p className="text-sm text-gray-500">
              Es una estimación orientativa. Revisaremos contigo el detalle en privado.
            </p>
          )}
        </div>
      )}
      {percent === 0 && (
        <p className="text-lg text-gray-600">
          Hemos revisado tu factura. Un asesor te contactará para comentar las mejores opciones.
        </p>
      )}
      {!showExact && <p className="text-sm text-gray-500">{LEGAL_TEXT}</p>}
    </div>
  );
}
