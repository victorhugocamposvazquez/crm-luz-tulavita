/**
 * Pantalla de resultado del ahorro estimado con reglas de presentación y texto legal.
 * Incluye ilustración de enchufe y efecto de luz en el texto de ahorro.
 */

import { Plug } from 'lucide-react';

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

  const percent = roundDownPercent(data.estimated_savings_percentage);
  const prudent = data.prudent_mode === true;
  const showExact = percent >= MIN_PERCENT_TO_SHOW && !prudent;
  const isNeutral = percent > 0 && percent < NEUTRAL_PERCENT_MAX && !prudent;

  return (
    <div className="space-y-4">
      {showExact && (
        <div className="space-y-4">
          <p
            className="text-3xl sm:text-4xl font-semibold text-emerald-600 animate-in fade-in duration-500"
            style={{
              textShadow: '0 0 20px rgba(5, 150, 105, 0.5), 0 0 40px rgba(5, 150, 105, 0.25)',
            }}
          >
            Podrías ahorrar hasta un <strong className="font-bold">{percent}%</strong>
          </p>
          <div
            className="flex justify-center animate-in slide-in-from-bottom-4 fade-in duration-700 delay-200"
            aria-hidden
          >
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-emerald-500/20 blur-md" />
              <div className="relative flex items-center gap-1 rounded-full border-2 border-emerald-600/40 bg-emerald-50/80 px-4 py-2.5 shadow-inner">
                <Plug
                  className="h-6 w-6 text-emerald-600 animate-in slide-in-from-left-2 duration-500 delay-300"
                  strokeWidth={2}
                />
                <span className="text-sm font-medium text-emerald-800">Enchufado al ahorro</span>
              </div>
            </div>
          </div>
        </div>
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
