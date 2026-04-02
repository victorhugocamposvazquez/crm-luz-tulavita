/**
 * Reduce texto de factura PDF a líneas relevantes para el LLM (menos tokens, menos latencia).
 *
 * Flujo típico: `pdf-parse` → `extractRelevantText(texto, EXTRACT_RELEVANT_MAX_CHARS_20TD|30TD)` →
 * Responses API solo con `input_text` (prompt corto + texto filtrado); PDF base64 solo como fallback.
 */

/** Máximo recomendado para 2.0TD (entrada al modelo). */
export const EXTRACT_RELEVANT_MAX_CHARS_20TD = 1800;

/** Máximo recomendado para 3.0TD (más periodos/tablas). */
export const EXTRACT_RELEVANT_MAX_CHARS_30TD = 2000;

const LINE_HAS_UNITS = /kwh|\bkw\b|€|\beur\b|%\s*IVA|%\s*impuesto/i;
const LINE_HAS_PERIOD = /\bP[1-6]\b/i;
const LINE_KEYWORDS =
  /\b(potencia|energ[ií]a|consumo|total|importe|peaje|factura|tarifa|periodo|contratad|activa|reactiva|alquiler|tasa|impuesto|descuento|precio)\b/i;
const LINE_META =
  /\b(CUPS|NIF|DNI|CIF|titular|direcci|suplido|ATR|2[\.,]0\s*TD|3[\.,]0\s*TD|lectura|facturaci)\b/i;

function normalizeRawText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function lineIsRelevant(line: string): boolean {
  const t = line.trim();
  if (t.length < 2) return false;
  if (LINE_HAS_UNITS.test(t)) return true;
  if (LINE_HAS_PERIOD.test(t)) return true;
  if (LINE_KEYWORDS.test(t)) return true;
  if (LINE_META.test(t)) return true;
  return false;
}

/**
 * Filtra líneas del PDF que suelen contener datos de facturación eléctrica y recorta a `maxChars`.
 * Si ninguna línea pasa el filtro, devuelve el inicio del documento normalizado (último recurso).
 */
export function extractRelevantText(text: string, maxChars: number = EXTRACT_RELEVANT_MAX_CHARS_20TD): string {
  const normalized = normalizeRawText(text);
  if (normalized.length <= maxChars) {
    const lines = normalized.split('\n');
    const kept = lines.filter(lineIsRelevant);
    const joined = kept.join('\n').trim();
    if (joined.length > 0) return joined;
    return normalized;
  }

  const lines = normalized.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (lineIsRelevant(line)) kept.push(line.trim());
  }

  let out = kept.join('\n').trim();
  const minKept = 400;
  if (out.length < minKept && kept.length === 0) {
    out = normalized.slice(0, Math.min(maxChars, normalized.length));
  } else if (out.length > maxChars) {
    out = out.slice(0, maxChars);
  }

  return out.trim();
}
