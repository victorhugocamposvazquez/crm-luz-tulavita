/**
 * Pantalla de resultado del ahorro estimado con reglas de presentación y texto legal
 */

const MIN_PERCENT_TO_SHOW = 8;
const NEUTRAL_PERCENT_MAX = 10;
const LEGAL_TEXT = 'Cálculo estimado basado en los datos de tu factura.';

export interface EnergyComparisonData {
  status: string;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  prudent_mode?: boolean;
}

function roundDownPercent(value: number | null): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.floor(value);
}

export function EnergySavingsResult({ data }: { data: EnergyComparisonData }) {
  if (data.status !== 'completed') {
    return (
      <p className="text-lg text-gray-600">
        Hemos recibido tu factura. Un asesor revisará los datos y te contactará con una estimación personalizada.
      </p>
    );
  }

  const amount = data.estimated_savings_amount ?? 0;
  const percent = roundDownPercent(data.estimated_savings_percentage);
  const prudent = data.prudent_mode === true;
  const showExact = percent >= MIN_PERCENT_TO_SHOW && !prudent;
  const isNeutral = percent > 0 && percent < NEUTRAL_PERCENT_MAX && !prudent;

  return (
    <div className="space-y-4">
      {showExact && (
        <p className="text-xl sm:text-2xl font-bold text-[#26606b]">
          Podrías ahorrar hasta un {percent}% (≈ {amount.toFixed(0)}€ al mes)
        </p>
      )}
      {prudent && percent > 0 && (
        <p className="text-xl sm:text-2xl font-bold text-[#26606b]">
          Hemos detectado una oportunidad de optimización en tu tarifa
        </p>
      )}
      {isNeutral && (
        <p className="text-xl sm:text-2xl font-bold text-[#26606b]">
          Hemos detectado una oportunidad de optimización en tu tarifa
        </p>
      )}
      {percent === 0 && (
        <p className="text-lg text-gray-600">
          Hemos revisado tu factura. Un asesor te contactará para comentar las mejores opciones.
        </p>
      )}
      <p className="text-sm text-gray-500">{LEGAL_TEXT}</p>
    </div>
  );
}
