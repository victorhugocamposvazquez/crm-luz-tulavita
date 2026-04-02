import { useCallback, useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AHORRO_LUZ_CTA_GREEN } from '@/lib/ahorro-luz-public-ui';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'tulavita_ahorro_luz_cookie_consent';

const ctaBtn =
  'rounded-xl border border-neutral-900/15 px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-none transition-[filter] hover:brightness-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2';

const COOKIE_POLICY_TEXT = `En Tulavita Energía utilizamos cookies propias y, en su caso, de terceros para fines analíticos y para mejorar tu experiencia en esta página.

Puedes aceptar todas las cookies, rechazar las no esenciales o obtener más información en esta política. La aceptación implica el uso de cookies según lo descrito.

Si tienes dudas, puedes contactarnos a través de los canales indicados en el sitio web.`;

export function AhorroLuzCookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem(STORAGE_KEY));
    } catch {
      setConsent(null);
    }
    setMounted(true);
  }, []);

  const persist = useCallback((value: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
    setConsent(value);
    setPolicyOpen(false);
  }, []);

  if (!mounted) return null;

  const showBanner = (consent === null || consent === '') && !policyOpen;

  return (
    <>
      {showBanner && (
        <div
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-label="Aviso de cookies"
        >
          <div
            className={cn(
              'relative flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 pr-11 pt-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4 sm:pr-12 sm:pt-4'
            )}
          >
            <button
              type="button"
              onClick={() => persist('rejected')}
              className="absolute right-2 top-2 rounded-md p-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 sm:right-2.5 sm:top-2.5"
              aria-label="Cerrar aviso de cookies"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex shrink-0 items-center gap-3 sm:border-r sm:border-neutral-200 sm:pr-4">
                <Cookie className="h-8 w-8 shrink-0 text-neutral-900 sm:h-7 sm:w-7" strokeWidth={1.5} aria-hidden />
                <span className="text-base font-bold text-neutral-950 sm:hidden">Cookies</span>
                <span className="hidden text-base font-bold text-neutral-950 sm:inline">Uso de cookies</span>
              </div>
              <p className="min-w-0 text-left text-sm leading-snug text-neutral-700">
                Utilizamos cookies para mejorar tu experiencia. Consulta nuestra{' '}
                <button
                  type="button"
                  onClick={() => setPolicyOpen(true)}
                  className="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-700"
                >
                  política de cookies
                </button>
                .
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-row gap-2 sm:w-auto">
              <button
                type="button"
                onClick={() => persist('rejected')}
                className={cn(ctaBtn, 'min-w-0 flex-1 sm:flex-none sm:px-5')}
                style={{ backgroundColor: AHORRO_LUZ_CTA_GREEN }}
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => persist('accepted')}
                className={cn(ctaBtn, 'min-w-0 flex-1 sm:flex-none sm:px-5')}
                style={{ backgroundColor: AHORRO_LUZ_CTA_GREEN }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="z-[110] max-h-[85dvh] max-w-lg overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-left text-neutral-950">Política de cookies</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-line text-left text-sm leading-relaxed text-neutral-600">
            {COOKIE_POLICY_TEXT}
          </div>
          <DialogFooter className="gap-2 sm:justify-stretch">
            <button
              type="button"
              onClick={() => persist('accepted')}
              className={cn(ctaBtn, 'w-full py-3')}
              style={{ backgroundColor: AHORRO_LUZ_CTA_GREEN }}
            >
              Aceptar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
