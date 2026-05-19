import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { ColaboradoresLandingVariant } from './colaboradores-config';
import { TV_BRAND, TEL_NUMBER, waLink } from './colaboradores-config';
import { useColaboradoresLeadSubmit } from '@/hooks/useColaboradoresLeadSubmit';

// ───────── logo ─────────
function TvLogo({ size = 30, dark = false }) {
  return (
    <div className="tv-logo">
      <div className="leaf" style={{
        width: size, height: size,
        background: dark ? '#161613' : '#fff',
        borderColor: dark ? 'rgba(255,255,255,.12)' : 'var(--line)'
      }}>
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
          <path d="M4 20c8 0 16-6 16-16-8 0-16 6-16 16zM4 20c2-4 6-7 11-9" stroke="#8bc414" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="#c4ed4f"/>
        </svg>
      </div>
      <span style={{ color: dark ? '#fff' : 'var(--fg)' }}>{TV_BRAND}</span>
    </div>
  );
}

// ───────── nav (sin variantes pesadas) ─────────
function TvNav({ cta = "Únete", onCta, dark = false, sticky = true }) {
  return (
    <div className="tv-nav" style={{
      background: dark ? 'var(--fg)' : 'var(--bg)',
      borderColor: dark ? 'rgba(255,255,255,.1)' : 'var(--line)',
      position: sticky ? 'sticky' : 'static',
    }}>
      <TvLogo dark={dark} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button type="button" className="tv-btn sm primary" onClick={onCta}>{cta}</button>
      </div>
    </div>
  );
}

// ───────── stat ─────────
function TvStat({ n, l, accent }) {
  return (
    <div className="tv-stat">
      <div className={"n " + (accent ? "accent" : "")}>{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

// ───────── formulario rápido ─────────
function TvForm({ compact = false, dark = false, variant }: { compact?: boolean; dark?: boolean; variant: ColaboradoresLandingVariant }) {
  const [state, setState] = useState({ nombre: '', tel: '', email: '' });
  const { submit: submitLead, sending, error, sent } = useColaboradoresLeadSubmit(variant);
  const submit = (e: FormEvent) => {
    void submitLead(e, state);
  };
  if (sent) {
    return (
      <div className="tv-card" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'var(--accent)', display: 'grid', placeItems: 'center',
          margin: '0 auto 12px'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 7"/>
          </svg>
        </div>
        <div style={{ fontWeight: 700, fontSize: 17 }}>¡Hablamos en menos de 24h!</div>
        <div className="tv-lead" style={{ fontSize: 14, marginTop: 6 }}>
          Te llamará {state.nombre.split(' ')[0] ? 'tu gestor asignado' : 'tu gestor asignado'} para configurar tu enlace de colaborador.
        </div>
      </div>
    );
  }
  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      <input className="tv-input" placeholder="Tu nombre"
        value={state.nombre} onChange={(e) => setState({ ...state, nombre: e.target.value })} />
      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : '1fr', gap: 10 }}>
        <input className="tv-input" type="tel" placeholder="Teléfono"
          value={state.tel} onChange={(e) => setState({ ...state, tel: e.target.value })} />
        <input className="tv-input" type="email" placeholder="Email (opcional)"
          value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} />
      </div>
      {error ? (
        <div style={{ fontSize: 12, color: '#b91c1c', textAlign: 'center' }}>{error}</div>
      ) : null}
      <button type="submit" disabled={sending} className="tv-btn block lg primary">
        {sending ? 'Enviando...' : 'Quiero colaborar'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </button>
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 2 }}>
        Sin ningún compromiso · Te respondemos en breve
      </div>
    </form>
  );
}

// ───────── botones WhatsApp / llamar ─────────
function TvContact({ stack = false, dark = false, waMessage = "Hola Tulavita, vengo de vuestra landing y quiero info" }) {
  return (
    <div style={{ display: stack ? 'grid' : 'flex', gap: 10, gridTemplateColumns: stack ? '1fr' : undefined }}>
      <a className="tv-btn wa" href={waLink(waMessage)} target="_blank" rel="noopener" style={{ flex: 1, textDecoration: 'none' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-1-.3-.1-.5-.1-.7.2s-.8 1-.9 1.1-.3.2-.5.1c-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5s-.7-1.7-1-2.3c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1.1 1-1.1 2.5 1.1 2.9 1.3 3.1 2.2 3.4 5.4 4.8c2 .9 2.8.9 3.8.8.6-.1 1.7-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.2-.3-.3-.5-.4M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.5 1.3 5L2 22l5.1-1.3c1.5.8 3.2 1.3 4.9 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2"/></svg>
        WhatsApp
      </a>
      <a className="tv-btn" href={"tel:" + TEL_NUMBER} style={{ flex: 1, textDecoration: 'none' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        Llamar
      </a>
    </div>
  );
}

// ───────── simulador de ingresos ─────────
function TvSimulator({ compact = false }) {
  const [clientes, setClientes] = useState(8);
  const comision = 45;       // €/cliente firmado (one-shot)
  const recurrente = 4.5;    // €/cliente/mes
  const total = clientes * comision + clientes * recurrente * 12;
  return (
    <div className="tv-card" style={{ padding: compact ? 18 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div>
          <div className="tv-eyebrow">Simulador</div>
          <div style={{ fontWeight: 700, fontSize: 18, marginTop: 4 }}>¿Cuánto puedes ganar?</div>
        </div>
        <div style={{ fontFamily: 'Geist Mono', fontSize: 12, color: 'var(--muted)' }}>año 1</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>Clientes captados al mes</div>
        <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'Geist Mono' }}>{clientes}</div>
      </div>
      <input type="range" min="1" max="40" value={clientes}
        onChange={(e) => setClientes(parseInt(e.target.value))}
        style={{
          width: '100%',
          accentColor: 'var(--accent-deep)',
        }} />
      <div style={{
        marginTop: 14,
        padding: '16px 18px',
        background: 'var(--accent)',
        borderRadius: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline'
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500 }}>Tus ingresos estimados</div>
          <div style={{ fontSize: 11, opacity: .7 }}>{clientes}/mes × 12 meses</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>
          {total.toLocaleString('es-ES')}€
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
        <div><strong style={{ color: 'var(--fg)' }}>{comision}€</strong> al firmar</div>
        <div>·</div>
        <div><strong style={{ color: 'var(--fg)' }}>{recurrente}€/mes</strong> recurrente</div>
      </div>
    </div>
  );
}

// ───────── testimonio ─────────
function TvTesti({ quote, name, role, init }) {
  return (
    <div className="tv-testi">
      <div className="quote">"{quote}"</div>
      <div className="who">
        <div className="ava">{init}</div>
        <div>
          <div className="name">{name}</div>
          <div className="role">{role}</div>
        </div>
      </div>
    </div>
  );
}

// ───────── logos de colaboradores oficiales ─────────
// Wordmarks tipográficos en gris — mismo tratamiento que la landing actual.
// Lista derivada del mercado eléctrico español. Editable en TV_PARTNERS.
const TV_PARTNERS = [
  { name: "Iberdrola",   style: { fontWeight: 800, letterSpacing: '-0.04em', textTransform: 'none' } },
  { name: "Endesa",      style: { fontWeight: 700, fontStyle: 'italic', letterSpacing: '-0.02em' } },
  { name: "NATURGY",     style: { fontWeight: 800, letterSpacing: '0.04em' } },
  { name: "Repsol",      style: { fontWeight: 700, letterSpacing: '-0.02em' } },
  { name: "EDP",         style: { fontWeight: 800, letterSpacing: '0.02em' } },
  { name: "CHC Energía", style: { fontWeight: 500, letterSpacing: '-0.01em' } },
  { name: "TotalEnergies", style: { fontWeight: 700, letterSpacing: '-0.02em' } },
  { name: "Holaluz",     style: { fontWeight: 700, letterSpacing: '-0.02em' } },
];

function TvPartners({ dark = false, warm = false, label = "Colaboradores oficiales" }) {
  // duplicamos los logos para que el marquee sea continuo
  const items = [...TV_PARTNERS, ...TV_PARTNERS];
  const cls = "tv-partners" + (dark ? " dark" : "") + (warm ? " warm" : "");
  return (
    <div className={cls} style={{
      background: dark ? 'var(--fg)' : (warm ? '#f6f4ed' : 'var(--bg)')
    }}>
      <div className="label"><span>· {label}</span></div>
      <div className="fade-l"></div>
      <div className="fade-r"></div>
      <div className="track">
        {items.map((p, i) => (
          <div key={i} className="tv-pl" style={p.style}>{p.name}</div>
        ))}
      </div>
    </div>
  );
}

// ───────── carrusel arrastrable de testimonios ─────────
function TvTestiCarousel({ items }) {
  const data = items || [
    { quote: "Tengo peluquería en Lugo. Pego el QR en el espejo y mientras espero al siguiente cliente le pregunto si paga mucho de luz. Saco unos 280€ extra al mes.",
      name: "Marta Vilas", role: "Peluquería · Lugo", init: "M" },
    { quote: "Como agente, lo uso al cerrar pisos. 'Os ayudo a contratar la luz, sin coste'. La gente alucina. 4-5 firmas al mes fácil.",
      name: "Pablo Reigosa", role: "Inmobiliaria · Vigo", init: "P" },
    { quote: "Llevo gestoría con 80 PYMES. En tres meses pasé media cartera. Lo cobro recurrente sin tocar nada nunca más.",
      name: "Sandra Castro", role: "Gestoría · Santiago", init: "S" },
    { quote: "Mi madre tiene 64 años y se aburría en casa. En dos meses le ha sacado más que con su pensión solo enseñando el QR a vecinas.",
      name: "Iván Pereira", role: "Estudiante · Ourense", init: "I" },
    { quote: "Soy profe. Lo comparto en el grupo del cole y entre padres. Cero esfuerzo, 180€ al mes que antes no tenía.",
      name: "Lucía Antelo", role: "Profesora · Pontevedra", init: "L" },
  ];

  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);

  // mouse drag to scroll (desktop pasa de scroll-touch)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let down = false, startX = 0, startLeft = 0;
    const md = (e) => {
      down = true;
      startX = e.pageX;
      startLeft = el.scrollLeft;
      el.style.cursor = 'grabbing';
      el.style.scrollSnapType = 'none';
    };
    const mm = (e) => {
      if (!down) return;
      e.preventDefault();
      el.scrollLeft = startLeft - (e.pageX - startX);
    };
    const mu = () => {
      if (!down) return;
      down = false;
      el.style.cursor = 'grab';
      el.style.scrollSnapType = '';
    };
    el.addEventListener('mousedown', md);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    return () => {
      el.removeEventListener('mousedown', md);
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.firstElementChild;
    if (!card) return;
    const w = card.offsetWidth + 12; // card width + gap
    setActive(Math.round(el.scrollLeft / w));
  };

  const goTo = (i) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.firstElementChild;
    if (!card) return;
    const w = card.offsetWidth + 12;
    el.scrollTo({ left: i * w, behavior: 'smooth' });
  };

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          display: 'flex',
          gap: 12,
          padding: '4px 24px 14px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollPaddingLeft: 24,
          cursor: 'grab',
          WebkitOverflowScrolling: 'touch',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          userSelect: 'none',
        }}>
        {data.map((t, i) => (
          <div key={i} className="tv-testi-slide" style={{
            flex: '0 0 86%',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
          }}>
            <TvTesti {...t} />
          </div>
        ))}
      </div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 24px',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {data.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} aria-label={"Testimonio " + (i+1)} style={{
              width: i === active ? 22 : 6, height: 6, borderRadius: 3,
              background: i === active ? 'var(--fg)' : 'var(--line)',
              border: 'none', padding: 0, cursor: 'pointer',
              transition: 'width .2s, background .2s'
            }}/>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => goTo(Math.max(0, active - 1))} className="tv-btn sm" style={{
            width: 32, height: 32, padding: 0, borderRadius: '50%'
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7.5 2L3.5 6l4 4"/></svg>
          </button>
          <button onClick={() => goTo(Math.min(data.length - 1, active + 1))} className="tv-btn sm" style={{
            width: 32, height: 32, padding: 0, borderRadius: '50%'
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4.5 2l4 4-4 4"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────── footer ─────────
function TvFoot({ dark = false }) {
  return (
    <div className="tv-foot" style={{ borderColor: dark ? 'rgba(255,255,255,.1)' : 'var(--line)' }}>
      <div>Tulavita S.L · 2026</div>
      <div style={{ display: 'flex', gap: 18 }}>
        <span>Aviso legal</span>
        <span>Política de colaborador</span>
      </div>
    </div>
  );
}


export {
  TvLogo,
  TvNav,
  TvStat,
  TvForm,
  TvContact,
  TvSimulator,
  TvTesti,
  TvTestiCarousel,
  TvPartners,
  TvFoot,
  waLink,
};
