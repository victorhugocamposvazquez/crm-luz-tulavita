import { useEffect } from 'react';

/** Pausa animaciones CSS infinitas mientras el usuario hace scroll (menos jank). */
export function useColaboradoresScrollPerf(rootSelector = '.colaboradores-landing-root') {
  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (!root) return;

    let scrollEndTimer: ReturnType<typeof setTimeout> | undefined;
    let ticking = false;

    const setScrolling = (scrolling: boolean) => {
      if (scrolling) root.classList.add('is-scrolling');
      else root.classList.remove('is-scrolling');
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        setScrolling(true);
        requestAnimationFrame(() => {
          ticking = false;
        });
      }
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => setScrolling(false), 180);
    };

    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (scrollEndTimer) clearTimeout(scrollEndTimer);
      root.classList.remove('is-scrolling');
    };
  }, [rootSelector]);
}
