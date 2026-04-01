/**
 * Pantalla inicial Ahorro Luz — look claro: fondo blanco, alto contraste, acento verde en CTAs.
 */

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ChevronRight, Pencil, Phone, Upload } from 'lucide-react';
import { AHORRO_PUBLIC_ACCENT } from '@/lib/ahorro-luz-public-ui';

const ACCENT = AHORRO_PUBLIC_ACCENT;

/** Marcas como wordmarks en escala de grises (sustituible por <img> si hay logos en /public) */
const PROVIDER_LOGOS: { name: string; className: string }[] = [
  { name: 'Endesa', className: 'font-serif text-xl sm:text-2xl font-semibold tracking-tight' },
  { name: 'Naturgy', className: 'text-lg sm:text-xl font-bold tracking-wide uppercase' },
  { name: 'Iberdrola', className: 'text-lg sm:text-xl font-medium tracking-tighter' },
  { name: 'Repsol', className: 'text-xl sm:text-2xl font-black italic' },
  { name: 'Octopus', className: 'font-serif text-lg sm:text-xl font-normal' },
  { name: 'Plenitude', className: 'text-base sm:text-lg font-semibold' },
  { name: 'TotalEnergies', className: 'text-base sm:text-lg font-bold tracking-tight' },
  { name: 'Holaluz', className: 'text-lg font-extrabold tracking-tight' },
  { name: 'Lucera', className: 'font-serif text-lg italic' },
  { name: 'Audax', className: 'text-lg font-bold uppercase tracking-widest' },
  { name: 'Factor Energía', className: 'text-base sm:text-lg font-semibold' },
  { name: 'CHC Energía', className: 'text-sm sm:text-base font-medium' },
];

function ProviderLogoMarquee() {
  const fadeMask = {
    maskImage: 'linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)',
    WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%)',
  } as const;

  const logoClass = (p: (typeof PROVIDER_LOGOS)[0]) =>
    cn('select-none whitespace-nowrap text-neutral-500 [filter:grayscale(1)]', p.className);

  const segment = (suffix: string) => (
    <div className="flex w-max shrink-0 items-center gap-x-12 pr-12 sm:gap-x-16 sm:pr-16">
      {PROVIDER_LOGOS.map((p) => (
        <span key={`${p.name}-${suffix}`} className={logoClass(p)}>
          {p.name}
        </span>
      ))}
    </div>
  );

  return (
    <>
      <div className="hidden flex-wrap justify-center gap-x-10 gap-y-4 px-4 py-5 motion-reduce:flex sm:gap-x-14">
        {PROVIDER_LOGOS.map((p) => (
          <span key={p.name} className={logoClass(p)}>
            {p.name}
          </span>
        ))}
      </div>
      <div className="motion-reduce:hidden w-full overflow-hidden py-5 sm:py-6" style={fadeMask}>
        <div className="flex w-max animate-logo-marquee">
          {segment('a')}
          {segment('b')}
        </div>
      </div>
    </>
  );
}

export type AhorroLuzHeroProps = {
  onFileSelected: (file: File) => void;
  onManualData: () => void;
  onRequestCall: () => void;
  maxFileMb?: number;
};

export function AhorroLuzHero({
  onFileSelected,
  onManualData,
  onRequestCall,
  maxFileMb = 10,
}: AhorroLuzHeroProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-screen flex flex-col bg-white text-neutral-900 antialiased">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const max = maxFileMb * 1024 * 1024;
          if (f.size > max) {
            toast({
              title: 'Archivo demasiado grande',
              description: `El tamaño máximo es ${maxFileMb} MB.`,
              variant: 'destructive',
            });
            return;
          }
          onFileSelected(f);
        }}
      />

      <header className="shrink-0 border-b border-neutral-200/80 bg-white">
        <div className="mx-auto flex w-full items-center justify-center gap-2.5 px-4 py-4 sm:gap-3 sm:px-6 sm:py-5">
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
      </header>

      <section className="relative flex flex-1 flex-col px-4 pb-12 pt-5 sm:px-6 sm:pb-16 sm:pt-12">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center text-center">
          <div
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600 sm:mb-8 sm:text-xs"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} aria-hidden />
            Ahorro en electricidad
          </div>

          <h1 className="max-w-[18ch] text-[1.75rem] font-extrabold leading-[1.1] tracking-tight text-neutral-950 sm:max-w-none sm:text-4xl md:text-[2.5rem]">
            Paga menos en tu{' '}
            <span className="text-neutral-900 underline decoration-[3px] decoration-[#22c55e] underline-offset-[5px]">
              factura de la luz
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-600 sm:text-lg">
            Sube tu factura y calculamos tu ahorro exacto en segundos. Sin letra pequeña.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'mt-8 w-full max-w-md rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50/60',
              'px-4 py-5 text-left transition-colors sm:mt-10 sm:py-6',
              'flex items-center gap-4',
              'hover:border-neutral-400 hover:bg-neutral-50',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e] focus-visible:ring-offset-2'
            )}
          >
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white sm:h-14 sm:w-14"
              aria-hidden
            >
              <Upload className="h-6 w-6 text-neutral-800 sm:h-7 sm:w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-neutral-900 sm:text-lg">Sube tu factura de luz</p>
              <p className="mt-0.5 text-xs text-neutral-500 sm:text-sm">
                PDF, JPG o PNG · hasta {maxFileMb} MB
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-neutral-400" aria-hidden />
          </button>

          <div className="my-7 flex w-full max-w-md items-center gap-3 sm:my-9">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="whitespace-nowrap px-2 text-xs text-neutral-500 sm:text-sm">o si no la tienes</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onManualData}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white py-3.5 px-4',
                'text-sm font-medium text-neutral-900 transition-colors sm:text-base',
                'hover:bg-neutral-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e] focus-visible:ring-offset-2'
              )}
            >
              <Pencil className="h-4 w-4 shrink-0 text-neutral-700" />
              Conozco mis datos
            </button>
            <button
              type="button"
              onClick={onRequestCall}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl border border-neutral-300 bg-white py-3.5 px-4',
                'text-sm font-medium text-neutral-900 transition-colors sm:text-base',
                'hover:bg-neutral-50',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22c55e] focus-visible:ring-offset-2'
              )}
            >
              <Phone className="h-4 w-4 shrink-0 text-neutral-700" />
              Que me llamen
            </button>
          </div>

          <div className="mt-3 grid w-full max-w-md grid-cols-3 gap-3 text-center sm:mt-16 sm:gap-4">
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums text-neutral-950 sm:text-2xl">
                <span style={{ color: ACCENT }}>340€</span>
              </p>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500 sm:text-xs">ahorro medio/año</p>
            </div>
            <div className="relative min-w-0">
              <div className="absolute left-0 top-1/2 hidden h-8 w-px -translate-y-1/2 bg-neutral-200 sm:block" />
              <div className="absolute right-0 top-1/2 hidden h-8 w-px -translate-y-1/2 bg-neutral-200 sm:block" />
              <p className="text-xl font-bold tabular-nums text-neutral-950 sm:text-2xl">2 min</p>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500 sm:text-xs">para ver resultado</p>
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold tabular-nums text-neutral-950 sm:text-2xl">gratis</p>
              <p className="mt-1 text-[10px] leading-snug text-neutral-500 sm:text-xs">sin permanencia</p>
            </div>
          </div>
        </div>

        <div className="relative mt-auto w-full pt-10 sm:pt-14">
          <p className="mb-1 px-4 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:mb-2 sm:text-[11px]">
            Comparamos entre las principales comercializadoras
          </p>
          <p className="sr-only">
            Incluimos comparativa con numerosas comercializadoras, entre otras Endesa, Naturgy, Iberdrola, Repsol,
            Octopus y Plenitude.
          </p>
          <div aria-hidden>
            <ProviderLogoMarquee />
          </div>
        </div>
      </section>
    </div>
  );
}
