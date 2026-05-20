import {
  TvContact,
  TvFoot,
  TvForm,
  TvNav,
  TvPartners,
  TvSimulator,
  TvTicker,
  waLink,
} from './colaboradores-shared';


export function LandingCompacta() {
  return (
    <div className="tv-root" data-screen-label="01 Casual · Compacto" style={{ position: 'relative' }}>
      <TvNav cta="Colaborar" />

      {/* HERO + SIMULADOR (2-col en escritorio) */}
      <div className="tv-hero" style={{ padding: '28px 24px 18px' }}>
        <div>
          <span className="tv-chip"><span className="dot"></span>Programa colaboradores</span>
          <h1 className="tv-display sm" style={{ marginTop: 16, marginBottom: 14 }}>
            Recomienda luz y <span className="tv-mark">cobra cada mes</span>.
          </h1>
          <p className="tv-lead">
            Tú decides cuándo y a quién. Te damos enlace, QR y formación.
            Sin inversión, sin permanencia.
          </p>
        </div>
        <div>
          <TvSimulator />
        </div>
      </div>

      <TvTicker />

      {/* FORM */}
      <div style={{ padding: '14px 24px 18px' }}>
        <div className="tv-card tv-form-card">
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Empieza hoy</div>
          <div className="tv-lead" style={{ fontSize: 13, marginBottom: 14 }}>
            Contactaremos pronto contigo para empezar.
          </div>
          <TvForm compact variant="compacta" />
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div className="tv-div">o si lo prefieres</div>
        <TvContact />
      </div>

      {/* social proof */}
      <div style={{ padding: '22px 24px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="tv-avatars">
            <div style={{ background: '#d9e7a8' }}>M</div>
            <div style={{ background: '#f3d9a8' }}>J</div>
            <div style={{ background: '#c8d3e6' }}>L</div>
            <div style={{ background: '#e6c8d3' }}>R</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>+312 colaboradores activos</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>★★★★★ 4,9 · valoración media</div>
          </div>
        </div>
      </div>

      <div style={{ height: 22 }}></div>
      <TvPartners />
      <TvFoot />

      {/* botón flotante WhatsApp · siempre visible */}
      <div className="tv-wafloat-wrap">
        <a className="tv-wafloat" href={waLink("Hola Tulavita, vengo de la landing de colaboradores y quiero más info")} target="_blank" rel="noopener" aria-label="Abrir WhatsApp">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.5 14.4c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2s-.8 1-.9 1.1-.3.2-.5.1c-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1.1 1-1.1 2.5 1.1 2.9 1.3 3.1 2.2 3.4 5.4 4.8c2 .9 2.8.9 3.8.8.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.5-.4M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.5.8 3.2 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
