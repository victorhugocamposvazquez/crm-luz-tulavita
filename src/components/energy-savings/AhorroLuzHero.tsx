/**
 * Pantalla inicial del flujo Ahorro Luz: hero oscuro, subida principal y accesos alternativos.
 * Referencia visual: landing con CTA de factura + "Conozco mis datos" / "Que me llamen".
 */

import { useRef } from 'react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { ChevronRight, Pencil, Phone, Upload } from 'lucide-react';

const HERO_BG = '#0a2224';
const ACCENT = '#5eead4';
const MUTED = 'rgba(255,255,255,0.72)';

const PROVIDERS: { name: string; color: string }[] = [
  { name: 'Endesa', color: '#0066cc' },
  { name: 'Naturgy', color: '#e85d04' },
  { name: 'Iberdrola', color: '#00a651' },
  { name: 'Repsol', color: '#e30613' },
  { name: 'Octopus', color: '#e91e8c' },
  { name: 'Plenitude', color: '#1a365d' },
];

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
    <div className="min-h-screen flex flex-col bg-[#061a1c] text-white">
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

      <section
        className="relative flex-1 flex flex-col px-4 sm:px-6 pt-[max(1.25rem,env(safe-area-inset-top))] pb-8 sm:pb-12 overflow-hidden"
        style={{
          backgroundColor: HERO_BG,
          backgroundImage: `
            radial-gradient(ellipse 120% 80% at 50% -20%, rgba(38,96,107,0.45), transparent 55%),
            radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)
          `,
          backgroundSize: '100% 100%, 22px 22px',
        }}
      >
        <div className="max-w-lg mx-auto w-full flex flex-col items-center text-center flex-1">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] sm:text-xs font-semibold tracking-[0.12em] uppercase mb-8 sm:mb-10"
            style={{ color: ACCENT }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" aria-hidden />
            Tulavita Energía
          </div>

          <h1 className="font-serif text-[1.65rem] sm:text-4xl md:text-[2.35rem] leading-tight font-bold text-white max-w-[20ch] sm:max-w-none">
            Paga menos en tu{' '}
            <span style={{ color: ACCENT }}>factura de la luz</span>
          </h1>
          <p className="mt-4 text-[15px] sm:text-lg font-normal max-w-md" style={{ color: MUTED }}>
            Sube tu factura y calculamos tu ahorro exacto en segundos. Sin letra pequeña.
          </p>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'mt-8 sm:mt-10 w-full max-w-md rounded-2xl border-2 border-dashed border-white/35 bg-white/[0.04]',
              'px-4 py-5 sm:py-6 flex items-center gap-4 text-left transition-colors',
              'hover:border-white/50 hover:bg-white/[0.07] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a2224] focus-visible:ring-[#5eead4]'
            )}
          >
            <span
              className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-xl bg-white/10"
              aria-hidden
            >
              <Upload className="h-6 w-6 sm:h-7 sm:w-7 opacity-90" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-semibold text-white">Sube tu factura de luz</p>
              <p className="text-xs sm:text-sm mt-0.5" style={{ color: MUTED }}>
                PDF, JPG o PNG · hasta {maxFileMb} MB
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 opacity-60" aria-hidden />
          </button>

          <div className="flex items-center gap-3 w-full max-w-md my-6 sm:my-8">
            <div className="h-px flex-1 bg-white/15" />
            <span className="text-xs sm:text-sm whitespace-nowrap px-2" style={{ color: MUTED }}>
              o si no la tienes
            </span>
            <div className="h-px flex-1 bg-white/15" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
            <button
              type="button"
              onClick={onManualData}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm sm:text-base font-medium',
                'bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]'
              )}
            >
              <Pencil className="h-4 w-4 shrink-0 opacity-90" />
              Conozco mis datos
            </button>
            <button
              type="button"
              onClick={onRequestCall}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl py-3.5 px-4 text-sm sm:text-base font-medium',
                'bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5eead4]'
              )}
            >
              <Phone className="h-4 w-4 shrink-0 opacity-90" />
              Que me llamen
            </button>
          </div>

          <div className="mt-10 sm:mt-14 grid grid-cols-3 gap-2 sm:gap-4 w-full max-w-md text-center">
            <div>
              <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: ACCENT }}>
                340€
              </p>
              <p className="text-[10px] sm:text-xs mt-1 leading-snug" style={{ color: MUTED }}>
                ahorro medio/año
              </p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold tabular-nums text-white">2 min</p>
              <p className="text-[10px] sm:text-xs mt-1 leading-snug" style={{ color: MUTED }}>
                para ver resultado
              </p>
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-white">gratis</p>
              <p className="text-[10px] sm:text-xs mt-1 leading-snug" style={{ color: MUTED }}>
                sin permanencia
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 mt-auto pt-6 sm:pt-8 max-w-2xl mx-auto w-full px-1">
          <div className="rounded-t-2xl sm:rounded-t-3xl bg-white text-gray-800 shadow-xl shadow-black/20 px-4 sm:px-6 py-5 sm:py-6 -mb-px">
            <p className="text-[10px] sm:text-[11px] font-semibold tracking-wider text-gray-500 text-center uppercase mb-4">
              Comparamos entre las principales comercializadoras
            </p>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5">
              {PROVIDERS.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50/80 px-2.5 py-1 text-xs font-medium text-gray-700"
                >
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              ))}
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-gray-500">
                +12 más
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
