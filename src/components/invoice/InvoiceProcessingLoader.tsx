import { useEffect, useState } from 'react';
import { Check, Circle, Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const BRAND = '#26606b';
const DEFAULT_STEP_INTERVAL_MS = 1000;

export interface InvoiceProcessingLoaderStep {
  label: string;
  icon: LucideIcon;
}

export function InvoiceProcessingLoader({
  title,
  subtitle,
  fileName,
  steps,
  note,
  compact = false,
  className,
  stepIntervalMs = DEFAULT_STEP_INTERVAL_MS,
}: {
  title: string;
  subtitle?: string;
  fileName?: string | null;
  steps: InvoiceProcessingLoaderStep[];
  note?: string;
  compact?: boolean;
  className?: string;
  /** Intervalo entre pasos del indicador (ms). */
  stepIntervalMs?: number;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (steps.length <= 1 || stepIndex >= steps.length - 1) return;
    const timeout = window.setTimeout(() => {
      setStepIndex((current) => Math.min(current + 1, steps.length - 1));
    }, stepIntervalMs);
    return () => window.clearTimeout(timeout);
  }, [stepIndex, steps.length, stepIntervalMs]);

  const currentStep = steps[stepIndex] ?? steps[0];
  const CurrentIcon = currentStep?.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-4 px-4' : 'py-10 px-4',
        className,
      )}
    >
      <div className="relative flex items-center justify-center">
        <div
          className={cn(
            'rounded-full border border-[#26606b]/15 bg-[#26606b]/5 animate-pulse',
            compact ? 'h-20 w-20' : 'h-28 w-28',
          )}
          aria-hidden
        />
        <div
          className={cn(
            'absolute rounded-full border-4 border-[#26606b]/15 border-t-[#26606b] animate-spin',
            compact ? 'h-16 w-16' : 'h-24 w-24',
          )}
          aria-hidden
        />
        <div
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#26606b]/10',
            compact ? 'h-12 w-12' : 'h-16 w-16',
          )}
        >
          {CurrentIcon ? (
            <CurrentIcon
              className={cn(compact ? 'h-5 w-5' : 'h-7 w-7')}
              style={{ color: BRAND }}
              strokeWidth={1.9}
              aria-hidden
            />
          ) : null}
        </div>
      </div>

      <div className={cn('space-y-2', compact ? 'mt-4' : 'mt-6')}>
        <p className={cn('font-semibold text-slate-900', compact ? 'text-base' : 'text-xl')}>
          {title}
        </p>
        {subtitle ? (
          <p className={cn('text-slate-600', compact ? 'text-sm' : 'text-base')}>
            {subtitle}
          </p>
        ) : null}
        {fileName ? (
          <p className="text-xs text-slate-500 break-all">
            {fileName}
          </p>
        ) : null}
      </div>

      <div className={cn('w-full max-w-xl', compact ? 'mt-4' : 'mt-6')}>
        <div
          className={cn(
            'grid gap-2',
            steps.length === 1 && 'sm:grid-cols-1',
            steps.length === 2 && 'sm:grid-cols-2',
            steps.length >= 3 && 'sm:grid-cols-3',
          )}
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            const active = index === stepIndex;
            const completed = index < stepIndex;

            return (
              <div
                key={`${step.label}-${index}`}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-all',
                  active && 'border-[#26606b]/30 bg-[#26606b]/8 shadow-sm',
                  completed && 'border-emerald-200 bg-emerald-50/80',
                  !active && !completed && 'border-slate-200 bg-white/80',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    active && 'bg-[#26606b] text-white',
                    completed && 'bg-emerald-600 text-white',
                    !active && !completed && 'bg-slate-100 text-slate-400',
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
                </span>
                <span
                  className={cn(
                    'flex-1 text-sm font-medium leading-tight',
                    active && 'text-slate-900',
                    completed && 'text-emerald-700',
                    !active && !completed && 'text-slate-500',
                  )}
                >
                  {step.label}
                </span>
                <span
                  className={cn(
                    'ml-auto flex shrink-0 items-center justify-center rounded-full border',
                    compact ? 'h-6 w-6' : 'h-7 w-7',
                    completed && 'border-emerald-600 bg-emerald-600 text-white',
                    active && 'border-[#26606b]/25 bg-[#26606b]/10 text-[#26606b]',
                    !active && !completed && 'border-slate-200 bg-slate-50 text-slate-300',
                  )}
                  aria-hidden
                >
                  {completed ? (
                    <Check className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} strokeWidth={2.5} />
                  ) : active ? (
                    <Loader2 className={cn('animate-spin', compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} strokeWidth={2} />
                  ) : (
                    <Circle className={cn(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} strokeWidth={2} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {note ? (
        <p className={cn('max-w-lg text-slate-500', compact ? 'mt-4 text-xs' : 'mt-5 text-sm')}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
