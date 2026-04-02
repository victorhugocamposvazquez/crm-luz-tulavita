import { useCallback, useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const STORAGE_KEY = 'tulavita_ahorro_luz_cookie_consent';

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

  const showBanner = consent === null || consent === '';

  return (
    <>
      {showBanner && (
        <div
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
          role="dialog"
          aria-label="Aviso de cookies"
        >
          <div
            className={cn(
              'flex w-full max-w-3xl flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4 sm:pr-5'
            )}
          >
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
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:gap-2">
              <button
                type="button"
                onClick={() => persist('rejected')}
                className={cn(
                  'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-900 sm:w-auto sm:px-5 sm:py-2',
                  'hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2'
                )}
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => persist('accepted')}
                className={cn(
                  'w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-900 sm:w-auto sm:px-5 sm:py-2',
                  'hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2'
                )}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-xl border-neutral-200 bg-white p-6 sm:rounded-2xl">
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
              className={cn(
                'w-full rounded-xl border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900',
                'hover:bg-neutral-200/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2'
              )}
            >
              Aceptar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
