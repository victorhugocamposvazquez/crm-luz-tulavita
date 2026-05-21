import { cn } from '@/lib/utils';

type ColaboradorPortalBrandHeaderProps = {
  subtitle?: string;
  className?: string;
  compact?: boolean;
};

export function ColaboradorPortalBrandHeader({
  subtitle = 'Portal colaborador',
  className,
  compact = false,
}: ColaboradorPortalBrandHeaderProps) {
  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <div className="flex items-center justify-center gap-3 sm:gap-3.5">
        <img
          src="/logo-tulavita.png"
          alt=""
          className={cn('shrink-0 object-contain', compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11')}
          width={44}
          height={44}
        />
        <span className={cn('font-semibold tracking-tight text-neutral-900', compact ? 'text-sm' : 'text-sm sm:text-base')}>
          Tulavita Energía
        </span>
      </div>
      {subtitle && (
        <div
          className={cn(
            'inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600 sm:text-xs',
            compact ? 'mt-3' : 'mt-4',
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime-500" aria-hidden />
          {subtitle}
        </div>
      )}
    </div>
  );
}
