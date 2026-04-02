import { cn } from '@/lib/utils';

/**
 * Cabecera fija Ahorro Luz: solo marca (enlace). La pastilla «Ahorro en electricidad» va en el hero junto al título.
 */
export function AhorroLuzBrandHeader({
  fixed = false,
  className,
}: {
  fixed?: boolean;
  className?: string;
}) {
  const inner = (
    <div
      className={cn(
        'flex w-full flex-col items-center px-4 sm:px-6',
        'pb-2 pt-[max(0.875rem,env(safe-area-inset-top))] sm:pb-2.5 sm:pt-[max(1.125rem,env(safe-area-inset-top))]',
        className
      )}
    >
      <a
        href="/ahorra-factura-luz"
        className="inline-flex no-underline outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <div className="flex items-center justify-center gap-3.5 sm:gap-4">
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
      </a>
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
