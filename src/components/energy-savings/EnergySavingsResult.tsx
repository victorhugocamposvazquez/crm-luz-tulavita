/**
 * Pantalla de resultado del ahorro estimado.
 * Secuencia: desenchufado (Lottie en reversa) → se enchufa → al terminar aparece el texto de ahorro. Fondo blanco.
 */

import { useState, useEffect, useRef } from 'react';
import Lottie, { type LottieRef } from 'lottie-react';

const MIN_PERCENT_TO_SHOW = 8;
const NEUTRAL_PERCENT_MAX = 10;
const LEGAL_TEXT = 'Cálculo estimado basado en los datos de tu factura.';

const ENCHUFE_ANIMATION_URL = '/animations/enchufe.json';
const ENCHUFE_TOTAL_FRAMES = 180;
/** Frame donde empieza (estado inicial). */
const ENCHUFE_FRAME_START = 131;
/** Frame donde acaba y se para (desenchufado). */
const ENCHUFE_FRAME_END = 102;

/**
 * Animación Lottie del enchufe. Empieza en 131, hace todo el bucle (131 → 180 → 0 → 102) y para en 102, luego onPlugged().
 */
function PlugIllustration({ onPlugged }: { onPlugged: () => void }) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [phase, setPhase] = useState<'loading' | 'unplugged' | 'plugging' | 'plugged'>('loading');
  const onPluggedRef = useRef(onPlugged);
  onPluggedRef.current = onPlugged;
  const lottieRef = useRef<LottieRef['current']>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(ENCHUFE_ANIMATION_URL)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setAnimationData(null);
      });
    return () => { cancelled = true; };
  }, []);

  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onDataReady = () => {
    const lottie = lottieRef.current;
    if (!lottie) return;
    // Mostrar primero el frame inicial (131)
    lottie.goToAndStop(ENCHUFE_FRAME_START, true);
    setPhase('unplugged');
    startTimeoutRef.current = setTimeout(() => {
      // Bucle completo: 131 → 180, luego 0 → 102, y parar
      lottie.playSegments([[ENCHUFE_FRAME_START, ENCHUFE_TOTAL_FRAMES], [0, ENCHUFE_FRAME_END]], true);
      setPhase('plugging');
    }, 400);
  };

  useEffect(() => () => {
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
  }, []);

  const handleComplete = () => {
    setPhase('plugged');
    onPluggedRef.current();
  };

  if (!animationData) {
    return (
      <div className="bg-white rounded-2xl p-6 flex flex-col items-center border border-gray-100 min-h-[140px] justify-center">
        <p className="text-sm text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-6 flex flex-col items-center border border-gray-100">
      <div className="w-28 h-28 flex items-center justify-center">
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={false}
          onDataReady={onDataReady}
          onComplete={handleComplete}
          style={{ width: 120, height: 120 }}
          rendererSettings={{ preserveAspectRatio: 'xMidYMid meet' }}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-3 font-medium">
        {phase === 'loading' && 'Cargando…'}
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
          {/* 1. Al enchufar aparece el texto de ahorro y debajo el legal */}
          {showSavingsText && (
            <div className="space-y-2 text-center w-full min-w-0">
              <div className="overflow-x-auto flex justify-center">
                <p
                  className="text-3xl sm:text-4xl font-semibold text-emerald-600 animate-in fade-in duration-500 zoom-in-95 whitespace-nowrap"
                  style={{
                    textShadow: '0 0 20px rgba(5, 150, 105, 0.5), 0 0 40px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  Podrías ahorrar hasta un <strong className="font-bold">{percent}%</strong>
                </p>
              </div>
              <p className="text-sm text-gray-500">{LEGAL_TEXT}</p>
            </div>
          )}
          {/* 2. Ilustración: primero desenchufado → efecto de enchufar → al enchufar se muestra el texto de arriba; debajo queda el enchufe y "Enchufado al ahorro" */}
          <PlugIllustration onPlugged={() => setShowSavingsText(true)} />
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
      {!showExact && <p className="text-sm text-gray-500">{LEGAL_TEXT}</p>}
    </div>
  );
}
