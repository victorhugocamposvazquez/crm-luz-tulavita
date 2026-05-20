import { useCallback, useEffect, useState } from 'react';
import { Cookie, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  COLABORADORES_COOKIE_POLICY_TEXT,
  COLABORADORES_COOKIE_STORAGE_KEY,
} from './colaboradores-legal';

export function ColaboradoresCookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [consent, setConsent] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  useEffect(() => {
    try {
      setConsent(localStorage.getItem(COLABORADORES_COOKIE_STORAGE_KEY));
    } catch {
      setConsent(null);
    }
    setMounted(true);
  }, []);

  const persist = useCallback((value: 'accepted' | 'rejected') => {
    try {
      localStorage.setItem(COLABORADORES_COOKIE_STORAGE_KEY, value);
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
          className="colaboradores-cookie-banner"
          role="dialog"
          aria-label="Aviso de cookies"
        >
          <div className="colaboradores-cookie-banner__panel">
            <button
              type="button"
              onClick={() => persist('rejected')}
              className="colaboradores-cookie-banner__close"
              aria-label="Cerrar aviso de cookies"
            >
              <X className="h-5 w-5" strokeWidth={2} />
            </button>
            <div className="colaboradores-cookie-banner__body">
              <div className="colaboradores-cookie-banner__title-row">
                <Cookie className="h-7 w-7 shrink-0" strokeWidth={1.5} aria-hidden />
                <span className="colaboradores-cookie-banner__title">Uso de cookies</span>
              </div>
              <p className="colaboradores-cookie-banner__text">
                Utilizamos cookies para mejorar tu experiencia. Consulta nuestra{' '}
                <button
                  type="button"
                  onClick={() => setPolicyOpen(true)}
                  className="colaboradores-cookie-banner__link"
                >
                  política de cookies
                </button>
                .
              </p>
            </div>
            <div className="colaboradores-cookie-banner__actions">
              <button
                type="button"
                onClick={() => persist('rejected')}
                className="tv-btn sm accent"
              >
                Rechazar
              </button>
              <button
                type="button"
                onClick={() => persist('accepted')}
                className="tv-btn sm primary"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent className="colaboradores-legal-dialog max-h-[85dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-left">Política de cookies</DialogTitle>
          </DialogHeader>
          <div className="colaboradores-legal-dialog__body whitespace-pre-line">
            {COLABORADORES_COOKIE_POLICY_TEXT}
          </div>
          <DialogFooter className="gap-2 sm:justify-stretch">
            <button
              type="button"
              onClick={() => persist('accepted')}
              className="tv-btn block lg accent"
            >
              Aceptar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
