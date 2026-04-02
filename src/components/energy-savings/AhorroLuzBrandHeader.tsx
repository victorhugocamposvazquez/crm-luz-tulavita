import { cn } from '@/lib/utils';
import { AHORRO_PUBLIC_ACCENT } from '@/lib/ahorro-luz-public-ui';

/** Misma marca, pastilla de contexto y tamaños en hero, formulario y pantallas posteriores. */
export function AhorroLuzBrandHeader({
  fixed = false,
  className,
}: {
  fixed?: boolean;
  /** Clases extra en el contenedor interno (p. ej. safe area). */
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        'flex w-full flex-col items-center px-4 sm:px-6',
        fixed
          ? 'pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pb-4 sm:pt-[max(1rem,env(safe-area-inset-top))]'
          : 'py-3 sm:py-4',
        className
      )}
    >
      <div className="flex items-center justify-center gap-2.5 sm:gap-3">
        <img
          src="/logo-tulavita.png"
          alt=""
          className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
          width={44}
          height={44}
        />
        <span className="text-center text-sm font-semibold tracking-tight text-neutral-900 sm:text-base">
          Tulavita Energía
        </span>
      </div>
      <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600 sm:mt-2.5 sm:text-xs">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: AHORRO_PUBLIC_ACCENT }} aria-hidden />
        Ahorro en electricidad
      </div>
    </div>
  );

  if (fixed) {
    return (
      <header className="fixed left-0 right-0 top-0 z-40 bg-white">
        {inner}
      </header>
    );
  }

  return <header className="shrink-0 bg-white">{inner}</header>;
}
