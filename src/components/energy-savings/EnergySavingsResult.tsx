/**
 * Pantalla de resultado del ahorro estimado.
 * Secuencia: desenchufado → se enchufa → al enchufar aparece el texto de ahorro con efecto luz. Fondo blanco.
 */

import { useState, useEffect, useRef } from 'react';

const MIN_PERCENT_TO_SHOW = 8;
const NEUTRAL_PERCENT_MAX = 10;
const LEGAL_TEXT = 'Cálculo estimado basado en los datos de tu factura.';

type PlugPhase = 'unplugged' | 'plugging' | 'plugged';

/** Ilustración enchufe/socket: primero desenchufado, luego animación de enchufar, al terminar se muestra el ahorro. Fondo blanco. */
function PlugIllustration({ onPlugged }: { onPlugged: () => void }) {
  const [phase, setPhase] = useState<PlugPhase>('unplugged');
  const onPluggedRef = useRef(onPlugged);
  onPluggedRef.current = onPlugged;

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('plugging'), 500);
    const t2 = setTimeout(() => {
      setPhase('plugged');
      onPluggedRef.current();
    }, 500 + 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const plugOffsetPx = phase === 'unplugged' ? 44 : 0;

  return (
    <div className="bg-white rounded-2xl p-6 flex flex-col items-center border border-gray-100">
      <div className="relative flex items-center justify-center h-28 w-56">
        {/* Socket (hembra): a la izquierda, estilo tipo foto */}
        <svg className="absolute left-2 w-24 h-24 shrink-0" viewBox="0 0 96 96" fill="none" aria-hidden>
          <rect x="12" y="32" width="48" height="40" rx="8" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
          <circle cx="28" cy="52" r="5" fill="#64748b" />
          <circle cx="44" cy="52" r="5" fill="#64748b" />
          <path d="M34 32 v-10 M46 32 v-10" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {/* Plug (macho): empieza separado y se desplaza hacia el socket */}
        <svg
          className="absolute right-2 w-24 h-24 shrink-0 transition-transform duration-700 ease-out"
          style={{ transform: `translateX(-${plugOffsetPx}px)` }}
          viewBox="0 0 96 96"
          fill="none"
          aria-hidden
        >
          <rect x="28" y="34" width="40" height="32" rx="6" fill="#f8fafc" stroke="#059669" strokeWidth="2" />
          <rect x="36" y="10" width="8" height="26" rx="2" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
          <rect x="52" y="10" width="8" height="26" rx="2" fill="#eab308" stroke="#ca8a04" strokeWidth="1" />
        </svg>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {phase === 'unplugged' && 'Desenchufado'}
        {phase === 'plugging' && 'Enchufando…'}
        {phase === 'plugged' && 'Enchufado al ahorro'}
      </p>
    </div>
  );
}

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

  const [showSavingsText, setShowSavingsText] = useState(false);

  return (
    <div className="space-y-4 bg-white rounded-xl p-4 sm:p-6">
      {showExact && (
        <div className="space-y-4">
          {/* Primero: ilustración desenchufado → enchufar (fondo blanco) */}
          <PlugIllustration onPlugged={() => setShowSavingsText(true)} />
          {/* Al enchufar: aparece el texto de ahorro con efecto de luz */}
          {showSavingsText && (
            <p
              className="text-3xl sm:text-4xl font-semibold text-emerald-600 text-center animate-in fade-in duration-500 zoom-in-95"
              style={{
                textShadow: '0 0 20px rgba(5, 150, 105, 0.5), 0 0 40px rgba(5, 150, 105, 0.25)',
              }}
            >
              Podrías ahorrar hasta un <strong className="font-bold">{percent}%</strong>
            </p>
          )}
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
