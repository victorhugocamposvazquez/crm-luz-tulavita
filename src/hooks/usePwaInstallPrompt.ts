import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isBeforeInstallPrompt(e: Event): e is BeforeInstallPromptEventLike {
  return 'prompt' in e && typeof (e as BeforeInstallPromptEventLike).prompt === 'function';
}

/**
 * Fires cuando el navegador considera la app instalable (manifest + SW activo, HTTPS, etc.).
 */
export function usePwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEventLike | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      if (!isBeforeInstallPrompt(e)) return;
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      setDeferred(null);
      return outcome === 'accepted';
    } catch {
      setDeferred(null);
      return false;
    }
  }, [deferred]);

  return { canInstall: deferred != null, promptInstall };
}
