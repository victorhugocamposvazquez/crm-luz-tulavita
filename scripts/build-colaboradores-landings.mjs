/**
 * Genera landings de colaboradores en public/colaboradores/
 * a partir de examples/tulavita-landing-*.html, conectando el formulario a /api/leads.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const SOURCES = [
  {
    input: 'examples/tulavita-landing-compacta.html',
    outDir: 'public/colaboradores',
    outFile: 'index.html',
    variant: 'compacta',
    campaign: 'colaboradores_compacta',
  },
  {
    input: 'examples/tulavita-landing-hibrida.html',
    outDir: 'public/colaboradores/hibrida',
    outFile: 'index.html',
    variant: 'hibrida',
    campaign: 'colaboradores_hibrida',
  },
];

const OLD_USE_STATE =
  "const [state, setState] = React.useState({ nombre: '', tel: '', email: '', sent: false });";

const NEW_USE_STATE =
  "const [state, setState] = React.useState({ nombre: '', tel: '', email: '', sent: false, sending: false, error: null });";

/** Mismo verde de CTAs que /ahorra-factura-luz (src/lib/ahorro-luz-public-ui.ts). */
const AHORRO_LUZ_CTA_GREEN = '#88f082';

const OLD_SUBMIT = `const submit = (e) => {
    e.preventDefault();
    if (!state.nombre || !state.tel) return;
    setState({ ...state, sent: true });
  };`;

const OLD_BTN_VARIANTS = `.tv-btn.primary { background: var(--fg); color: #fff; border-color: var(--fg); }
.tv-btn.accent  { background: var(--accent); color: var(--fg); border-color: var(--accent); font-weight: 600; }`;

const NEW_BTN_VARIANTS = `.tv-btn.primary {
  background: var(--cta-green);
  color: var(--fg);
  border-color: rgba(10,10,10,.15);
  font-weight: 600;
}
.tv-btn.primary:hover:not(:disabled) { filter: brightness(0.97); }
.tv-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; filter: none; }
.tv-btn.accent {
  background: var(--cta-green);
  color: var(--fg);
  border-color: rgba(10,10,10,.15);
  font-weight: 600;
}
.tv-btn.accent:hover:not(:disabled) { filter: brightness(0.97); }
.tv-btn.accent:disabled { opacity: 0.5; cursor: not-allowed; transform: none; filter: none; }`;

/** Estilos de botones alineados con AhorroLuzHero / formulario ahorra-factura-luz. */
function patchAhorroLuzButtonStyles(templateHtml) {
  if (!templateHtml.includes('.tv-btn.primary')) return templateHtml;

  let html = templateHtml;

  if (!html.includes('--cta-green')) {
    html = html.replace(
      '  --accent: #c4ed4f;        /* verde lima Tulavita */',
      `  --accent: #c4ed4f;        /* decoración / highlights */\n  --cta-green: ${AHORRO_LUZ_CTA_GREEN};  /* CTAs como /ahorra-factura-luz */`,
    );
  }

  html = html.replace(OLD_BTN_VARIANTS, NEW_BTN_VARIANTS);

  html = html.replace(
    '.tv-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 14px 20px;\n  border-radius: 999px;',
    '.tv-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 14px 20px;\n  border-radius: 12px;',
  );

  html = html.replace(
    '.tv-btn.lg      { padding: 16px 26px; font-size: 16px; }',
    '.tv-btn.lg      { padding: 16px 32px; font-size: 16px; font-weight: 600; }',
  );

  return html;
}

function patchTemplateInHtml(html) {
  const tag = '<script type="__bundler/template">';
  // El manifest real está al final del HTML (no en el loader inline).
  const ts = html.lastIndexOf(tag);
  if (ts < 0) return html;
  const te = html.lastIndexOf('</script>');
  if (te < 0 || te <= ts) return html;

  const inner = html.slice(ts + tag.length, te).trim();
  const templateHtml = JSON.parse(inner);
  const patched = patchAhorroLuzButtonStyles(templateHtml);
  if (patched === templateHtml) return html;

  return html.slice(0, ts + tag.length) + '\n' + JSON.stringify(patched) + '\n  ' + html.slice(te);
}

function buildSubmitHandler(campaign, variant) {
  return `const submit = async (e) => {
    e.preventDefault();
    if (!state.nombre || !state.tel || state.sending) return;
    setState({ ...state, sending: true, error: null });
    try {
      const payload = {
        name: state.nombre,
        phone: state.tel,
        email: state.email || undefined,
        source: 'web_form',
        campaign: '${campaign}',
        custom_fields: {
          landing_type: 'colaboradores',
          landing_variant: '${variant}',
        },
      };
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo enviar la solicitud');
      }
      if (data.lead?.id) {
        await fetch('/api/lead-entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_id: data.lead.id, source: 'web_form' }),
        }).catch(() => {});
      }
      setState({ ...state, sent: true, sending: false, error: null });
    } catch (err) {
      setState({
        ...state,
        sending: false,
        error: (err && err.message) ? err.message : 'No se pudo enviar la solicitud',
      });
    }
  };`;
}

function gunzip(buf) {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

async function decodeEntry(entry) {
  let bytes = Buffer.from(entry.data, 'base64');
  if (entry.compressed) bytes = await gunzip(bytes);
  return bytes.toString('utf8');
}

async function encodeEntry(text, original) {
  const bytes = Buffer.from(text, 'utf8');
  let data;
  let compressed = false;
  if (original.compressed) {
    data = zlib.gzipSync(bytes).toString('base64');
    compressed = true;
  } else {
    data = bytes.toString('base64');
  }
  return { ...original, data, compressed };
}

async function patchHtml(html, { campaign, variant, waNumber, telNumber }) {
  html = patchTemplateInHtml(html);

  const ms = html.indexOf('<script type="__bundler/manifest">');
  const me = html.indexOf('</script>', ms);
  if (ms < 0 || me < 0) throw new Error('Manifest no encontrado');

  const manifest = JSON.parse(
    html.slice(ms + '<script type="__bundler/manifest">'.length, me).trim(),
  );

  const newSubmit = buildSubmitHandler(campaign, variant);
  let patched = 0;

  for (const uuid of Object.keys(manifest)) {
    let src = await decodeEntry(manifest[uuid]);
    if (!src.includes(OLD_SUBMIT)) continue;

    src = src.replace(OLD_USE_STATE, NEW_USE_STATE);
    src = src.replace(OLD_SUBMIT, newSubmit);
    src = src.replace(
      `<button type="submit" className={"tv-btn block lg " + (dark ? "accent" : "primary")}>
        Quiero colaborar`,
      `{state.error ? (
        <div style={{ fontSize: 12, color: '#b91c1c', textAlign: 'center' }}>{state.error}</div>
      ) : null}
      <button type="submit" disabled={state.sending} className="tv-btn block lg primary">
        {state.sending ? 'Enviando...' : 'Quiero colaborar'}`,
    );

    src = src.replace(
      'className="tv-btn accent block lg"',
      'className="tv-btn block lg primary"',
    );
    src = src.replace(
      'className={"tv-btn sm " + (dark ? "accent" : "primary")}',
      'className="tv-btn sm primary"',
    );

    if (waNumber) {
      src = src.replace(/const WA_NUMBER = "[^"]*";/, `const WA_NUMBER = "${waNumber}";`);
    }
    if (telNumber) {
      src = src.replace(/const TEL_NUMBER = "[^"]*";/, `const TEL_NUMBER = "${telNumber}";`);
    }

    manifest[uuid] = await encodeEntry(src, manifest[uuid]);
    patched += 1;
  }

  if (patched === 0) {
    throw new Error(`No se encontró el handler de formulario en ${campaign}`);
  }

  const manifestJson = JSON.stringify(manifest);
  return html.slice(0, ms) + '<script type="__bundler/manifest">\n' + manifestJson + '\n  ' + html.slice(me);
}

async function main() {
  const waNumber = (process.env.VITE_COLABORADORES_WA_NUMBER || process.env.COLABORADORES_WA_NUMBER || '')
    .replace(/\D/g, '');
  const telNumber = process.env.VITE_COLABORADORES_TEL || process.env.COLABORADORES_TEL || '';

  for (const spec of SOURCES) {
    const inputPath = path.join(root, spec.input);
    const outDir = path.join(root, spec.outDir);
    const outPath = path.join(outDir, spec.outFile);

    if (!fs.existsSync(inputPath)) {
      console.warn(`[landings] Omitido (no existe): ${spec.input}`);
      continue;
    }

    const html = fs.readFileSync(inputPath, 'utf8');
    const patched = await patchHtml(html, {
      campaign: spec.campaign,
      variant: spec.variant,
      waNumber: waNumber || null,
      telNumber: telNumber || null,
    });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, patched);
    console.log(`[landings] ${spec.variant} → ${path.relative(root, outPath)}`);
  }
}

main().catch((err) => {
  console.error('[landings] Error:', err);
  process.exit(1);
});
