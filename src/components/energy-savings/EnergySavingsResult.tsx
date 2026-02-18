/**
 * Pantalla de resultado del ahorro estimado.
 * Secuencia: desenchufado (frame 148) → se enchufa en reversa hasta 0 → al terminar aparece el texto de ahorro.
 */

import { useState, useEffect, useRef } from 'react';
import Lottie, { type LottieRef } from 'lottie-react';

const MIN_PERCENT_TO_SHOW = 8;
const NEUTRAL_PERCENT_MAX = 10;
const LEGAL_TEXT = 'Cálculo estimado basado en los datos de tu factura.';

const ENCHUFE_ANIMATION_URL = '/animations/enchufe.json';
const ENCHUFE_FRAME_UNPLUGGED = 148;
/** Menor delay para que la frase de ahorro aparezca antes. */
const DELAY_BEFORE_PLAY_MS = 200;

/**
 * Animación Lottie del enchufe. Empieza en 148 (desenchufado), reproduce en reversa hasta 0 (enchufado), luego onPlugged().
 */
function PlugIllustration({ onPlugged }: { onPlugged: () => void }) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [phase, setPhase] = useState<'loading' | 'unplugged' | 'plugging' | 'plugged'>('loading');
  const [readyToShow, setReadyToShow] = useState(false);
  const onPluggedRef = useRef(onPlugged);
  onPluggedRef.current = onPlugged;
  const lottieRef = useRef<LottieRef['current']>(null);
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initDoneRef = useRef(false);

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

  const initAnimation = () => {
    if (initDoneRef.current) return;
    const lottie = lottieRef.current;
    if (!lottie) return;
    initDoneRef.current = true;
    lottie.goToAndStop(ENCHUFE_FRAME_UNPLUGGED, true);
    setReadyToShow(true);
    setPhase('unplugged');
    startTimeoutRef.current = setTimeout(() => {
      lottie.setDirection(-1);
      lottie.play();
      setPhase('plugging');
    }, DELAY_BEFORE_PLAY_MS);
  };

  const onDataReady = () => initAnimation();
  const onConfigReady = () => setTimeout(() => initAnimation(), 0);

  useEffect(() => {
    if (!animationData) return;
    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      initAnimation();
      if (initDoneRef.current || attempts >= 5) clearInterval(id);
    }, 300);
    return () => clearInterval(id);
  }, [animationData]);

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
      <div
        className={`w-28 h-28 flex items-center justify-center transition-opacity duration-200 ${readyToShow ? 'opacity-100' : 'opacity-0'}`}
        style={{ minHeight: 120 }}
      >
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={false}
          autoplay={false}
          onConfigReady={onConfigReady}
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
            <div className="space-y-2 text-center w-full min-w-0 px-1">
              <p
                className="text-2xl sm:text-4xl font-semibold text-emerald-600 animate-in fade-in duration-500 zoom-in-95 break-words"
                style={{
                  textShadow: '0 0 20px rgba(5, 150, 105, 0.5), 0 0 40px rgba(5, 150, 105, 0.25)',
                }}
              >
                Podrías ahorrar hasta un <strong className="font-bold">{percent}%</strong>
              </p>
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
