import { useEffect, type ReactNode } from 'react';
import './colaboradores-landing.css';

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
  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', description);
  }, [title, description]);

  return (
    <div className="colaboradores-landing-page min-h-screen bg-[#ece9df]">
      <div
        id="colaboradores-root"
        className="colaboradores-landing-root mx-auto min-h-screen max-w-[1180px] bg-[var(--bg,#fafaf8)] shadow-[0_0_60px_rgba(0,0,0,0.08)]"
      >
        {children}
      </div>
    </div>
  );
}
