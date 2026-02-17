/**
 * Loader de una sola pasada: progreso lineal y mensajes por fases. No repite en bucle.
 */

import { useState, useEffect, useRef } from 'react';
import { FileSearch, Scale, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const BRAND = '#26606b';
const DURATION_MS = 11000;

const STEPS = [
  { label: 'Analizando tu factura…', icon: FileSearch },
  { label: 'Comparando tarifas…', icon: Scale },
  { label: 'Buscando tu mejor oferta…', icon: Sparkles },
] as const;

export function EnergySavingsLoader() {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    startRef.current = performance.now();

    const tick = (now: number) => {
      const start = startRef.current ?? now;
      const elapsed = now - start;
      const p = Math.min(elapsed / DURATION_MS, 1);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const stepIndex = Math.min(
    Math.max(0, Math.floor(Number(progress) * STEPS.length)),
    STEPS.length - 1
  );
  const currentStep = STEPS[stepIndex] ?? STEPS[0];
  const StepIcon = currentStep.icon;

  return (
    <div className="flex flex-col items-center gap-8 py-10 px-4">
      {/* Icono central con glow */}
      <div
        className="relative flex items-center justify-center w-20 h-20 rounded-full transition-all duration-500"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${BRAND}22 0%, transparent 70%)`,
          boxShadow: progress < 1 ? `0 0 40px ${BRAND}40` : `0 0 24px ${BRAND}30`,
        }}
      >
        <StepIcon
          className="w-10 h-10 transition-all duration-300"
          style={{ color: BRAND }}
          strokeWidth={1.8}
          aria-hidden
        />
      </div>

      {/* Mensaje actual */}
      <p
        className="text-lg font-medium text-gray-800 text-center min-h-[2rem] transition-opacity duration-300"
        key={stepIndex}
      >
        {currentStep.label}
      </p>

      {/* Barra de progreso (una sola pasada) */}
      <div className="w-full max-w-xs">
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress * 100}%`,
              backgroundColor: BRAND,
            }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2 text-center tabular-nums">
          {progress >= 1 ? 'Listo en unos segundos…' : `${Math.round(progress * 100)}%`}
        </p>
      </div>

      {/* Indicadores de pasos (puntos que se activan en secuencia) */}
      <div className="flex gap-2">
        {STEPS.map((step, i) => {
          const active = i <= stepIndex;
          const Icon = step?.icon ?? FileSearch;
          return (
            <div
              key={step?.label ?? i}
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-full border-2 transition-all duration-300',
                active
                  ? 'border-[#26606b] bg-[#26606b]/10'
                  : 'border-gray-200 bg-gray-50'
              )}
              aria-hidden
            >
              <Icon
                className={cn('w-4 h-4', active ? 'opacity-100' : 'opacity-30')}
                style={active ? { color: BRAND } : undefined}
                strokeWidth={2}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
