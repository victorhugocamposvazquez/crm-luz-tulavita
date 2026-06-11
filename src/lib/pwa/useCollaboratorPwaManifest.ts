import { useEffect } from 'react';

const COLLABORATOR_MANIFEST = '/colaborador.webmanifest';
const COLLABORATOR_THEME = '#84cc16';
const COLLABORATOR_TITLE = 'Colaborador';

/**
 * Mientras el colaborador está en su portal, sustituye el manifest del CRM por
 * el del portal (`/colaborador.webmanifest`) para que el navegador ofrezca
 * instalar "Tulavita Colaborador" con su propio scope y pantalla de inicio.
 * Restaura los valores originales al salir.
 */
export function useCollaboratorPwaManifest(): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const appleTitleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');

    const prevManifest = manifestLink?.getAttribute('href') ?? null;
    const prevTheme = themeMeta?.getAttribute('content') ?? null;
    const prevTitle = appleTitleMeta?.getAttribute('content') ?? null;

    if (manifestLink) manifestLink.setAttribute('href', COLLABORATOR_MANIFEST);
    if (themeMeta) themeMeta.setAttribute('content', COLLABORATOR_THEME);
    if (appleTitleMeta) appleTitleMeta.setAttribute('content', COLLABORATOR_TITLE);

    return () => {
      if (manifestLink && prevManifest) manifestLink.setAttribute('href', prevManifest);
      if (themeMeta && prevTheme) themeMeta.setAttribute('content', prevTheme);
      if (appleTitleMeta && prevTitle) appleTitleMeta.setAttribute('content', prevTitle);
    };
  }, []);
}
