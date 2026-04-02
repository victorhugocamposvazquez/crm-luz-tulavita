import { cn } from '@/lib/utils';

const STAR_PATH =
  'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';

function StarCell({ fill, className }: { fill: number; className?: string }) {
  const pct = Math.min(1, Math.max(0, fill)) * 100;
  return (
    <span className={cn('relative inline-block h-[1.125rem] w-[1.125rem] shrink-0 sm:h-5 sm:w-5', className)}>
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full text-neutral-200" aria-hidden>
        <path fill="currentColor" d={STAR_PATH} />
      </svg>
      <span className="absolute inset-0 overflow-hidden text-neutral-900" style={{ width: `${pct}%` }}>
        <svg viewBox="0 0 24 24" className="h-[1.125rem] w-[1.125rem] sm:h-5 sm:w-5" aria-hidden>
          <path fill="currentColor" d={STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

function RatingStars({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div
      className="flex items-center gap-px sm:gap-0.5"
      role="img"
      aria-label={`Valoración ${value} sobre ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <StarCell key={i} fill={value - i} />
      ))}
    </div>
  );
}

/** Fila de valoración minimalista encima de la franja de comercializadoras. */
export function AhorroLuzReviewsStrip({
  rating = 4.89,
  reviewCount = 750,
  className,
}: {
  rating?: number;
  reviewCount?: number;
  className?: string;
}) {
  const ratingLabel = Number.isInteger(rating) ? String(rating) : rating.toFixed(2).replace('.', ',');

  return (
    <div className={cn('w-full border-t border-neutral-200 px-4 pt-6 sm:pt-8', className)}>
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-2 pb-6 text-center sm:max-w-none sm:flex-row sm:items-center sm:pb-8 sm:gap-3">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <RatingStars value={rating} />
          <span className="text-base font-bold tabular-nums text-neutral-950 sm:text-lg">{ratingLabel}</span>
        </div>
        <span className="text-sm text-neutral-500 sm:pl-0">
          de {reviewCount.toLocaleString('es-ES')} reseñas
        </span>
      </div>
    </div>
  );
}
