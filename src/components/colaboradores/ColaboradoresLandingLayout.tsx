import { useEffect, type ReactNode } from 'react';
import { useColaboradoresScrollPerf } from '@/hooks/useColaboradoresScrollPerf';
import { ColaboradoresCookieConsent } from './ColaboradoresCookieConsent';
import './colaboradores-landing.css';
import './colaboradores-perf.css';

type ColaboradoresLandingLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
};

export function ColaboradoresLandingLayout({
  title,
  description,
  children,
}: ColaboradoresLandingLayoutProps) {
  useColaboradoresScrollPerf();

  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
  }, [title, description]);

  return (
    <div className="colaboradores-landing-page">
      <div className="colaboradores-landing-root">{children}</div>
      <ColaboradoresCookieConsent />
    </div>
  );
}
