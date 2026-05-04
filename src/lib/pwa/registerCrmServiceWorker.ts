/** Registra el SW global (PWA + Web Push). En desarrollo no se registra para no interferir con Vite. */
export function registerCrmServiceWorker(): void {
  if (import.meta.env.DEV || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
      console.warn('[CRM] Service worker:', err);
    });
  });
}

export function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia('(display-mode: standalone)');
  if (mq.matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}
