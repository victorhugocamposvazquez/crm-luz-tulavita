import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Share, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePwaInstallPrompt } from '@/hooks/usePwaInstallPrompt';
import { isRunningAsInstalledPwa } from '@/lib/pwa/registerCrmServiceWorker';
import { toast } from '@/hooks/use-toast';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

type InstallPwaPromptProps = {
  className?: string;
  variant?: 'card' | 'inline';
};

/**
 * Invita a instalar el portal del colaborador como app. En Chrome/Edge usa el
 * prompt nativo; en iOS muestra las instrucciones de "Añadir a pantalla de inicio".
 */
export function InstallPwaPrompt({ className, variant = 'card' }: InstallPwaPromptProps) {
  const { canInstall, promptInstall } = usePwaInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (dismissed || isRunningAsInstalledPwa()) return null;

  const ios = isIos();
  // En navegadores que no exponen el prompt y no son iOS, no mostramos nada
  // (evita ruido en escritorios donde ya está instalado o no aplica).
  if (!canInstall && !ios) return null;

  const handleInstall = async () => {
    if (canInstall) {
      const accepted = await promptInstall();
      if (accepted) {
        toast({ title: 'App instalada', description: 'Ábrela desde tu pantalla de inicio.' });
        setDismissed(true);
      }
      return;
    }
    setShowIosHelp((v) => !v);
  };

  const containerClass =
    variant === 'card'
      ? 'rounded-lg border border-lime-200 bg-lime-50 p-3'
      : 'rounded-lg border bg-background p-3';

  return (
    <div className={cn(containerClass, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 text-lime-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Instala el portal en tu móvil</p>
            <p className="text-xs text-muted-foreground">
              Acceso directo y a pantalla completa, como una app.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        <Button size="sm" variant="outline" onClick={() => void handleInstall()}>
          {ios ? <Share className="h-3.5 w-3.5 mr-1.5" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          {ios ? 'Cómo instalar en iPhone' : 'Instalar app'}
        </Button>
      </div>

      {ios && showIosHelp && (
        <ol className="mt-3 space-y-1 text-xs text-muted-foreground list-decimal pl-4">
          <li>
            Pulsa el botón <span className="font-medium">Compartir</span> de Safari (el cuadrado con la flecha).
          </li>
          <li>
            Elige <span className="font-medium">«Añadir a pantalla de inicio»</span>.
          </li>
          <li>Confirma. El icono aparecerá junto a tus apps.</li>
        </ol>
      )}
    </div>
  );
}
