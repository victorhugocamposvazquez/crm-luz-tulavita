import { lazy, Suspense, useState } from 'react';
import {
  TvContact,
  TvFoot,
  TvForm,
  TvNav,
  TvPartners,
  TvSimulator,
  TvTestiCarousel,
  TvTicker,
  waLink,
} from './colaboradores-shared';

const TvBot = lazy(() => import('./TvBot').then((m) => ({ default: m.TvBot })));

export function LandingHazteColaborador() {
  const [open, setOpen] = useState(0);
  const faqs = [
    {
      q: "¿Tengo que vender algo?",
      a: "No vendes nada. Compartes un enlace, un QR o pasas el contacto. Nosotros llamamos, contratamos y firmamos. Tú cobras."
    },
    {
      q: "¿Cuándo cobro la primera comisión?",
      a: "Cuando el cliente firma y se valida la activación (normalmente 48h). El recurrente entra cada día 1."
    },
    {
      q: "¿Y si el cliente se va?",
      a: "Pierdes el recurrente de ese cliente, pero la comisión de firma es tuya. Los datos del cliente nunca se comparten con otros colaboradores."
    },
    {
      q: "¿Puedo hacer esto a la vez que mi trabajo?",
      a: "Es para lo que está diseñado. La mayoría de nuestros colaboradores lo combinan con su actividad principal."
    },
  ];

  return (
    <div className="tv-root" data-screen-label="Hazte colaborador" style={{ position: 'relative' }}>
      <TvNav cta="Colaborar" />

      {/* ───── ABOVE THE FOLD (de V1) ───── */}

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
          <TvForm compact />
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        <div className="tv-div">o si lo prefieres</div>
        <TvContact />
      </div>

      {/* social proof */}
      <div style={{ padding: '22px 24px 18px' }}>
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

      <TvPartners />

      {/* ───── CUERPO LARGO (de V2) ───── */}

      {/* divisor visual sutil */}
      <div style={{
        margin: '24px 24px 0',
        padding: '14px 0',
        textAlign: 'center',
        borderTop: '1px solid var(--line)',
        fontSize: 11, color: 'var(--muted)',
        letterSpacing: '0.16em', textTransform: 'uppercase'
      }}>
        ↓ ¿Quieres saber más? ↓
      </div>

      {/* CÓMO FUNCIONA */}
      <div style={{ padding: '20px 24px 14px' }}>
        <span className="tv-eyebrow">Cómo funciona</span>
        <h2 className="tv-display sm" style={{ fontSize: 30, marginTop: 8, marginBottom: 20 }}>
          Cuatro pasos. Sin literatura.
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 18px' }}>
          {[
            ['01', 'Te das de alta gratis', 'Rellenas el formulario o nos escribes y te contactamos.'],
            ['02', 'Recibes tu enlace y QR', 'Personal. Compártelo donde quieras: clientes, vecinos, redes, locales.'],
            ['03', 'Nosotros hacemos el resto', 'Atendemos, firmamos contrato y damos el alta. Tú no haces papeleo.'],
            ['04', 'Cobras cada mes', 'Comisión al firmar + recurrente mensual.'],
          ].map((s, i) => (
            <div key={i} style={{
              padding: '14px 0',
              borderTop: '1px solid var(--line)',
            }}>
              <div style={{
                fontFamily: 'Geist Mono', fontSize: 12, fontWeight: 600,
                color: 'var(--accent-deep)', marginBottom: 8
              }}>{s[0]}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, lineHeight: 1.2 }}>{s[1]}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.45 }}>{s[2]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CUALQUIERA PUEDE */}
      <div className="tv-section-soft" style={{ padding: '8px 24px 32px' }}>
        <div style={{ padding: '28px 0 10px' }}>
          <span className="tv-eyebrow">¿Es para ti?</span>
          <h2 className="tv-display sm" style={{ fontSize: 30, marginTop: 8, marginBottom: 14 }}>
            Cualquiera puede.
          </h2>
          <p className="tv-lead" style={{ fontSize: 14, marginBottom: 18 }}>
            Da igual a qué te dediques o cuántas horas le quieras dedicar — te formamos y te damos las herramientas.
            Estos son <strong>solo algunos perfiles</strong> que ya cobran con nosotros:
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[
            'Comercio local', 'Inmobiliaria', 'Gestoría', 'Autónomos',
            'Sanitarios', 'Profesores', 'Influencers',
            'Estudiantes', 'Pensionistas', 'Buscas un extra',
            'Reformas y obras', 'Asesorías',
          ].map((p, i) => (
            <span key={i} style={{
              padding: '8px 14px',
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 999,
              fontSize: 13, fontWeight: 500,
              color: 'var(--fg-soft)',
              whiteSpace: 'nowrap'
            }}>{p}</span>
          ))}
          <span style={{
            padding: '8px 14px',
            background: 'var(--fg)', color: '#fff',
            border: '1px solid var(--fg)',
            borderRadius: 999,
            fontSize: 13, fontWeight: 600,
            whiteSpace: 'nowrap'
          }}>+ tu perfil</span>
        </div>

        <div style={{
          marginTop: 18,
          padding: '14px 16px',
          background: 'var(--card)',
          border: '1px dashed var(--line)',
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--fg-soft)',
          lineHeight: 1.5,
          display: 'flex', alignItems: 'flex-start', gap: 12
        }}>
          <div style={{
            flexShrink: 0,
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'grid', placeItems: 'center',
            fontWeight: 800, fontSize: 14
          }}>?</div>
          <div>
            <strong style={{ color: 'var(--fg)' }}>¿No te ves en ninguno?</strong> Da igual.
            Si quieres trabajar con nosotros, el primer paso es escribirnos. Nos adaptamos a ti.
          </div>
        </div>
      </div>

      {/* TESTIMONIOS · carrusel */}
      <div style={{ padding: '28px 0 14px' }}>
        <div style={{ padding: '0 24px' }}>
          <span className="tv-eyebrow">Lo que dicen</span>
          <h2 className="tv-display sm" style={{ fontSize: 28, marginTop: 8, marginBottom: 18 }}>
            Gente real, dinero real.
          </h2>
        </div>
        <TvTestiCarousel />
      </div>

      {/* FAQ */}
      <div style={{ padding: '28px 24px 14px' }}>
        <span className="tv-eyebrow">Preguntas</span>
        <h2 className="tv-display sm" style={{ fontSize: 28, marginTop: 8, marginBottom: 18 }}>
          Lo que siempre nos preguntan.
        </h2>
        <div style={{
          border: '1px solid var(--line)', borderRadius: 16,
          background: 'var(--card)', overflow: 'hidden'
        }}>
          {faqs.map((f, i) => (
            <div key={i} style={{
              borderTop: i === 0 ? 'none' : '1px solid var(--line)'
            }}>
              <button onClick={() => setOpen(open === i ? -1 : i)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  padding: '16px 18px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 12, cursor: 'pointer', fontFamily: 'inherit'
                }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--fg)' }}>{f.q}</span>
                <span style={{
                  width: 22, height: 22, borderRadius: 11, flexShrink: 0,
                  background: open === i ? 'var(--accent)' : 'var(--bg-warm)',
                  display: 'grid', placeItems: 'center',
                  transition: 'transform .2s',
                  transform: open === i ? 'rotate(45deg)' : 'none'
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#0a0a0a" strokeWidth="1.8" strokeLinecap="round"><path d="M5 1v8M1 5h8"/></svg>
                </span>
              </button>
              {open === i && (
                <div style={{ padding: '0 18px 16px', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5 }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* CIERRE · habla con Lara */}
      <div className="tv-section-soft" style={{ padding: '32px 24px 28px', marginTop: 14 }}>
        <span className="tv-chip"><span className="dot"></span>Habla con alguien</span>
        <h2 className="tv-display sm" style={{ fontSize: 30, marginTop: 14, marginBottom: 8 }}>
          ¿Sigues con dudas?
        </h2>
        <p className="tv-lead" style={{ marginBottom: 18 }}>
          Cuéntaselas a Lara. Te responde al momento y, si quieres, te apunta para que un compañero te llame.
        </p>
        <Suspense fallback={<div className="tv-card" style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>Cargando asistente…</div>}>
          <TvBot />
        </Suspense>
      </div>

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
