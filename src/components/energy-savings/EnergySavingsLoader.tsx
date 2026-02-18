/**
 * Loader de una sola pasada: círculo que se rellena en verde y engloba iconos, texto y porcentaje.
 */

import { useState, useEffect, useRef } from 'react';
import { FileSearch, Scale, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const BRAND = '#26606b';
const DURATION_MS = 11000;
const SIZE = 280;
const STROKE = 8;
const R = (SIZE - STROKE) / 2; // radio del path (centro del trazo)
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

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
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex flex-col items-center py-10 px-4">
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Círculo de progreso: un solo arco verde que crece de 0% a 100% según progress */}
        <svg
          className="absolute inset-0"
          width={SIZE}
          height={SIZE}
          style={{ transform: 'rotate(-90deg)' }}
          aria-hidden
        >
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={STROKE}
          />
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke="#059669"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            style={{
              strokeDashoffset,
              transition: 'stroke-dashoffset 80ms linear',
            }}
          />
        </svg>

        {/* Contenido dentro del círculo: icono, mensaje, %, indicadores */}
        <div className="relative z-10 flex flex-col items-center gap-3 px-6">
          <div
            className="flex items-center justify-center w-14 h-14 rounded-full transition-all duration-500"
            style={{
              background: `radial-gradient(circle at 50% 50%, ${BRAND}22 0%, transparent 70%)`,
              boxShadow: progress < 1 ? `0 0 32px ${BRAND}35` : `0 0 20px ${BRAND}25`,
            }}
          >
            <StepIcon
              className="w-7 h-7 transition-all duration-300"
              style={{ color: BRAND }}
              strokeWidth={1.8}
              aria-hidden
            />
          </div>
          <p
            className="text-sm font-medium text-gray-800 text-center leading-tight min-h-[2.25rem] transition-opacity duration-300"
            key={stepIndex}
          >
            {currentStep.label}
          </p>
          <p
            className={cn(
              'text-lg tabular-nums font-semibold',
              progress < 1 ? 'text-emerald-600' : 'text-gray-600'
            )}
          >
            {progress >= 1 ? 'Listo…' : `${Math.round(progress * 100)}%`}
          </p>
          <div className="flex gap-1.5">
            {STEPS.map((step, i) => {
              const active = i <= stepIndex;
              const Icon = step?.icon ?? FileSearch;
              return (
                <div
                  key={step?.label ?? i}
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-300',
                    active ? 'border-[#26606b] bg-[#26606b]/10' : 'border-gray-200 bg-gray-50'
                  )}
                  aria-hidden
                >
                  <Icon
                    className={cn('w-3.5 h-3.5', active ? 'opacity-100' : 'opacity-30')}
                    style={active ? { color: BRAND } : undefined}
                    strokeWidth={2}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
