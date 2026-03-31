/**
 * Extracción de datos de facturas energéticas españolas mediante GPT-4o Vision.
 *
 * Estrategia: GPT-4o-mini como modelo principal (rápido y barato). Si la extracción
 * tiene baja confianza (campos clave ausentes), reintenta con GPT-4o como fallback.
 *
 * Usa la Responses API de OpenAI que soporta PDFs nativamente (extrae texto + imágenes
 * de cada página) e imágenes directas. No requiere conversión previa de PDF a imagen.
 */

import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL_FAST = 'gpt-4o-mini';
const MODEL_FULL = 'gpt-4o';
/** Por debajo: segunda llamada a gpt-4o (más lenta). Subir solo si aceptas más fallos sin fallback. */
const CONFIDENCE_THRESHOLD = Number(process.env.INVOICE_LLM_CONFIDENCE_THRESHOLD ?? '0.7') || 0.7;
const MAX_TOKENS = (() => {
  const raw = process.env.INVOICE_LLM_MAX_OUTPUT_TOKENS;
  const n = raw != null && raw !== '' ? Number(raw) : 2000;
  return Math.min(4096, Math.max(800, Number.isFinite(n) ? n : 2000));
})();

const SYSTEM_PROMPT = `Eres un experto en facturas de energía eléctrica y gas en España. Tu trabajo es extraer datos estructurados de facturas.

INSTRUCCIONES:
1. Analiza TODAS las páginas de la factura de principio a fin, sin saltarte ninguna tabla.
2. Extrae los datos con la mayor precisión posible.
3. Los decimales en España usan COMA (ej: "1.234,56" = 1234.56). Convierte siempre a formato numérico con punto decimal.
4. Si un dato no aparece o no es legible, usa null.
5. Responde EXCLUSIVAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks.

FORMATO NUMÉRICO ESPAÑOL — CRÍTICO:
En España: PUNTO = separador de miles, COMA = separador decimal.
- "714,000 kWh" → 714.0 (NO 714000)
- "1.473,059 kWh" → 1473.059
- "553,714 kWh" → 553.714
- "26,000 kW" → 26.0 (NO 26000)
- "33,000 kW" → 33.0
- "835,00 €" → 835.00
- "0,219748" → 0.219748
Regla: si ves "NNN,NNN" con 3 decimales tras la coma, los 3 dígitos tras la coma SON decimales (ej: "714,000" = 714.000 = 714.0).

ESQUEMA JSON:
{
  "company_name": "string",
  "consumption_kwh": number,
  "total_factura": number,
  "importe_energia_activa": number,
  "importe_potencia": number,
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "period_months": number,
  "potencia_contratada_kw": number,
  "potencia_p1_kw": number, "potencia_p2_kw": number, "potencia_p3_kw": number,
  "potencia_p4_kw": number, "potencia_p5_kw": number, "potencia_p6_kw": number,
  "precio_energia_kwh": number,
  "precio_p1_kwh": number, "precio_p2_kwh": number, "precio_p3_kwh": number,
  "precio_p4_kwh": number, "precio_p5_kwh": number, "precio_p6_kwh": number,
  "consumo_p1_kwh": number, "consumo_p2_kwh": number, "consumo_p3_kwh": number,
  "consumo_p4_kwh": number, "consumo_p5_kwh": number, "consumo_p6_kwh": number,
  "tipo_tarifa": "string",
  "cups": "string",
  "titular": "string",
  "direccion_suministro": "string"
}

PASO 1 — DETERMINA EL TIPO DE TARIFA:
Busca "2.0TD", "3.0TD", "2.0A", "3.0A", etc. Esto determina cuántos periodos (P1-P2 o P1-P6).

PASO 2 — POTENCIA CONTRATADA:
- Busca "Término de potencia", "Potencia facturada", "Potencia contratada".
- Extrae la potencia (kW) de CADA FILA P1…P6. Lee cada fila individualmente.
- potencia_contratada_kw = potencia de P1.
- En 3.0TD frecuentemente P1=P2=P3=P4=P5 tienen un valor (ej. 26 kW) y P6 tiene otro distinto (ej. 33 kW). Lee cada fila.

PASO 3 — CONSUMO DE ENERGÍA (EL MÁS IMPORTANTE):
- Busca TODAS las secciones de "Término de energía activa", "Energía activa", "Consumo" en TODA la factura.

*** REGLA CRÍTICA PARA 3.0TD — MÚLTIPLES BLOQUES ***
Las facturas 3.0TD casi siempre tienen DOS O MÁS BLOQUES de energía activa en el mismo periodo de facturación, separados por fechas distintas. Típicamente:
  - Bloque 1: "Del 01/12/2025 al 24/12/2025" (o similar)
  - Bloque 2: "Del 25/12/2025 al 31/12/2025" (cambio de precio regulado)
Estos bloques pueden estar en la MISMA página (uno debajo del otro) o en páginas DISTINTAS.
Cada bloque tiene su propia tabla con filas P1, P2, ..., P6 con kWh, €/kWh e importe.

PROCEDIMIENTO OBLIGATORIO EN 3.0TD:
1. Recorre TODAS las páginas buscando TODAS las tablas de energía activa.
2. Para cada periodo Px: SUMA los kWh de TODOS los bloques.
   Si el bloque 1 dice P1=600 kWh y el bloque 2 dice P1=282 kWh → consumo_p1_kwh = 882.
3. Para precios (precio_pX_kwh): usa el precio del bloque con MÁS kWh o más días.
4. Si un periodo Px no aparece en ningún bloque (o dice 0 kWh), pon 0 (NO null).

- "importe_energia_activa": suma de TODOS los importes (€) de energía activa de todos los bloques y periodos. Busca "Total energía activa" o suma los importes de cada fila. Sirve como control: importe_energia_activa / consumption_kwh ≈ precio_energia_kwh (±5%).
- consumption_kwh = consumo_p1_kwh + consumo_p2_kwh + ... + consumo_p6_kwh.

PASO 4 — PRECIO MEDIO:
- precio_energia_kwh = Σ(consumo_pX_kwh × precio_pX_kwh) / consumption_kwh (media ponderada). Solo incluye periodos con consumo > 0 y precio > 0.
- Debe quedar entre 0.05 y 0.35 €/kWh. NO uses total_factura/consumption_kwh (eso incluye potencia, impuestos, IVA).
- Contraverificación: importe_energia_activa / consumption_kwh también debe dar aprox. ese valor.

PASO 5 — POTENCIA (IMPORTE):
- "importe_potencia": suma de todos los importes del "Término de potencia" (todas las filas P1-P6). Busca el total o suma las filas.

PASO 6 — DATOS GENERALES:
- "total_factura": importe TOTAL a pagar (IVA incluido). Busca "Total factura", "Total a pagar".
- "period_start" y "period_end": fechas del periodo facturado.
- "period_months": calcula de las fechas (01/12/2025–31/12/2025 = 1).
- "cups": código ES + 16 dígitos + 2 letras.
- "titular": nombre del titular del contrato.
- "direccion_suministro": dirección completa del punto de suministro.
- "company_name": nombre comercial de la comercializadora.

VERIFICACIÓN FINAL — OBLIGATORIA (haz estas comprobaciones antes de responder):
1. consumption_kwh == consumo_p1_kwh + … + consumo_p6_kwh (usando 0 para null). Si no cuadra, corrige.
2. COMPROBACIÓN DE CONSUMO COMPLETO:
   - Calcula: importe_energia_activa / consumption_kwh. Debe dar ≈ precio_energia_kwh (entre 0.05 y 0.35).
   - Calcula: total_factura / consumption_kwh. Si supera 0.40 €/kWh, ES MUY PROBABLE que falte un bloque de energía. Vuelve a escanear TODA la factura buscando más tablas de "energía activa" con otras fechas.
   - En una factura de luz española típica, el coste total (con IVA, potencia, IE) dividido entre kWh suele estar entre 0.18 y 0.40 €/kWh. Si te da > 0.45, casi seguro falta consumo.
3. precio_energia_kwh ≈ Σ(consumo_pX × precio_pX) / consumption_kwh.
4. Si 3.0TD: ¿leíste TODOS los bloques de energía (suelen ser 2-3 por cambio de precios regulados)? ¿potencia_p6_kw puede ser distinta de P1?
5. Si 2.0TD: P3 a P6 deben ser null en potencia, consumo y precio.
6. period_start: ¿primer día del periodo facturado, no la víspera (30/11 cuando es diciembre)?`;

const USER_PROMPT = 'Extrae todos los datos de esta factura de energía. Devuelve SOLO el JSON, sin explicaciones.';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface ResponsesAPIInput {
  type: string;
  [key: string]: unknown;
}

/**
 * Llama a la Responses API de OpenAI con el modelo indicado.
 */
async function callResponsesAPI(
  fileBuffer: Buffer,
  mimeType: string,
  model: string,
  apiKey: string,
): Promise<InvoiceExtraction> {
  const isPdf = mimeType === 'application/pdf';
  const base64Data = fileBuffer.toString('base64');
  const content: ResponsesAPIInput[] = [
    { type: 'input_text', text: USER_PROMPT },
  ];

  if (isPdf) {
    content.push({
      type: 'input_file',
      file_data: `data:application/pdf;base64,${base64Data}`,
      filename: 'factura.pdf',
    });
  } else {
    content.push({
      type: 'input_image',
      image_url: `data:${mimeType};base64,${base64Data}`,
    });
  }

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      input: [{ role: 'user', content }],
      max_output_tokens: MAX_TOKENS,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[llm-extract] OpenAI API error (${model})`, res.status, errText.slice(0, 500));
    return emptyExtraction();
  }

  const data = (await res.json()) as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    output_text?: string;
  };

  const raw = data.output_text
    ?? data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
    ?? null;

  if (!raw) {
    console.error(`[llm-extract] No text in response (${model}):`, JSON.stringify(data).slice(0, 300));
    return emptyExtraction();
  }

  return parseLLMResponse(raw.trim());
}

function is30TD(e: InvoiceExtraction): boolean {
  const t = (e.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
  return t.includes('3.0') || t.includes('30TD') || t.includes('30A');
}

function computeConfidence(e: InvoiceExtraction): number {
  const base: [boolean, number][] = [
    [e.consumption_kwh != null && e.consumption_kwh > 0, 0.20],
    [e.total_factura != null && e.total_factura > 0, 0.20],
    [e.company_name != null, 0.10],
    [e.titular != null, 0.05],
    [e.cups != null, 0.05],
    [e.potencia_contratada_kw != null || e.potencia_p1_kw != null, 0.05],
    [e.tipo_tarifa != null, 0.05],
    [e.direccion_suministro != null, 0.05],
  ];
  let score = base.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0);

  if (is30TD(e)) {
    const has6Pot = [e.potencia_p1_kw, e.potencia_p2_kw, e.potencia_p3_kw, e.potencia_p4_kw, e.potencia_p5_kw, e.potencia_p6_kw]
      .filter((v) => v != null).length >= 6;
    /** En 3.0TD muchas facturas solo muestran precio en periodos con consumo (p. ej. 3 de 6). Exigir ≥3, no 4. */
    const priceCount = [e.precio_p1_kwh, e.precio_p2_kwh, e.precio_p3_kwh, e.precio_p4_kwh, e.precio_p5_kwh, e.precio_p6_kwh]
      .filter((v) => v != null).length;
    const has6Price = priceCount >= 3;
    const hasConsumoBreakdown = [e.consumo_p1_kwh, e.consumo_p2_kwh, e.consumo_p3_kwh, e.consumo_p4_kwh, e.consumo_p5_kwh, e.consumo_p6_kwh]
      .some((v) => v != null && v > 0);
    score += has6Pot ? 0.08 : 0;
    score += has6Price ? 0.08 : 0;
    score += hasConsumoBreakdown ? 0.09 : 0;
    if (!has6Pot || !has6Price || !hasConsumoBreakdown) {
      console.log(`[llm-extract] 3.0TD incomplete: 6pot=${has6Pot}, 6price=${has6Price}, consumoBreakdown=${hasConsumoBreakdown} — forcing low confidence`);
      score = Math.min(score, 0.5);
    }
  } else {
    score += 0.25;
  }

  if (e.consumption_kwh != null && e.total_factura != null && e.consumption_kwh > 0) {
    const implied = e.total_factura / e.consumption_kwh;
    if (implied < 0.05 || implied > 0.80) {
      console.log(`[llm-extract] implied price ${implied.toFixed(4)} out of range — penalizing confidence`);
      score = Math.min(score, 0.4);
    }
  }

  return Math.min(score, 1);
}

/**
 * Extrae datos de una factura energética.
 * Por defecto: gpt-4o-mini y, si la confianza es baja, una segunda llamada a gpt-4o.
 *
 * Variables de entorno (opcional):
 * - INVOICE_LLM_MODEL: si está definida (ej. gpt-4o-mini o gpt-4o), una sola llamada con ese modelo.
 * - INVOICE_LLM_DISABLE_FALLBACK=1: no llamar a gpt-4o (más rápido; peor en facturas difíciles).
 * - INVOICE_LLM_CONFIDENCE_THRESHOLD: umbral 0–1 (por defecto 0.7). Más bajo = menos fallbacks.
 * - INVOICE_LLM_MAX_OUTPUT_TOKENS: límite de salida (por defecto 1200; menos = algo más rápido).
 */
export async function extractWithLLM(
  fileBuffer: Buffer,
  mimeType: string
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }

  const isPdf = mimeType === 'application/pdf';
  const isImage = IMAGE_MIMES.has(mimeType);

  if (!isPdf && !isImage) {
    console.error('[llm-extract] Unsupported mime type:', mimeType);
    return emptyExtraction();
  }

  const singleModel = (process.env.INVOICE_LLM_MODEL ?? '').trim();
  const noFallback = process.env.INVOICE_LLM_DISABLE_FALLBACK === '1'
    || process.env.INVOICE_LLM_DISABLE_FALLBACK === 'true';

  if (singleModel) {
    const t0 = Date.now();
    const one = await callResponsesAPI(fileBuffer, mimeType, singleModel, apiKey);
    one.confidence = computeConfidence(one);
    console.log(`[llm-extract] ${singleModel} single call in ${Date.now() - t0}ms (confidence: ${one.confidence.toFixed(2)})`);
    return one;
  }

  const tFast = Date.now();
  const fast = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey);
  fast.confidence = computeConfidence(fast);
  console.log(`[llm-extract] gpt-4o-mini in ${Date.now() - tFast}ms (confidence: ${fast.confidence.toFixed(2)})`);

  if (fast.confidence >= CONFIDENCE_THRESHOLD) {
    return fast;
  }

  if (noFallback) {
    console.log('[llm-extract] fallback desactivado (INVOICE_LLM_DISABLE_FALLBACK), devolviendo mini');
    return fast;
  }

  console.log(`[llm-extract] gpt-4o-mini bajo umbral (${fast.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}), fallback gpt-4o...`);
  const tFull = Date.now();
  const full = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey);
  full.confidence = computeConfidence(full);
  console.log(`[llm-extract] gpt-4o in ${Date.now() - tFull}ms (confidence: ${full.confidence.toFixed(2)})`);

  if (full.confidence >= fast.confidence) return full;
  console.log('[llm-extract] gpt-4o peor que mini, devolviendo mini');
  return fast;
}

/**
 * Fuerza extracción con gpt-4o (modelo completo).
 * Usado por el pipeline cuando gpt-4o-mini produce consumo sospechoso en 3.0TD.
 */
export async function extractWithLLMForceFull(
  fileBuffer: Buffer,
  mimeType: string
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract-force-full] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const t0 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey);
  result.confidence = computeConfidence(result);
  console.log(`[llm-extract] gpt-4o forced retry in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)})`);
  return result;
}

/**
 * Fallback: extrae usando Chat Completions API con imágenes base64 (para cuando
 * se necesite enviar múltiples imágenes individuales, ej: páginas pre-renderizadas).
 */
export async function extractWithLLMImages(
  imageBuffers: Buffer[],
  mimeTypes: string[]
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || imageBuffers.length === 0) return emptyExtraction();

  const content: Array<{ type: string; text?: string; image_url?: { url: string; detail: string } }> = [
    { type: 'text', text: USER_PROMPT },
  ];

  for (let i = 0; i < imageBuffers.length; i++) {
    const b64 = imageBuffers[i].toString('base64');
    const mime = mimeTypes[i] || 'image/jpeg';
    content.push({
      type: 'image_url',
      image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' },
    });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_FAST,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: MAX_TOKENS,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[llm-extract-images] OpenAI error', res.status, errText.slice(0, 300));
    return emptyExtraction();
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) return emptyExtraction();

  return parseLLMResponse(raw);
}

function parseLLMResponse(raw: string): InvoiceExtraction {
  let jsonStr = raw;
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[llm-extract] JSON parse failed:', jsonStr.slice(0, 300));
    return emptyExtraction();
  }

  return {
    company_name: safeString(parsed.company_name),
    consumption_kwh: safePositiveNumber(parsed.consumption_kwh),
    total_factura: safePositiveNumber(parsed.total_factura),
    importe_energia_activa: safePositiveNumber(parsed.importe_energia_activa),
    importe_potencia: safeNonNegativeNumber(parsed.importe_potencia),
    period_start: safeString(parsed.period_start),
    period_end: safeString(parsed.period_end),
    period_months: safePeriodMonths(parsed.period_months, safeString(parsed.period_start), safeString(parsed.period_end)),
    confidence: 0,
    potencia_contratada_kw: safePositiveNumber(parsed.potencia_contratada_kw),
    potencia_p1_kw: safePositiveNumber(parsed.potencia_p1_kw),
    potencia_p2_kw: safePositiveNumber(parsed.potencia_p2_kw),
    potencia_p3_kw: safePositiveNumber(parsed.potencia_p3_kw),
    potencia_p4_kw: safePositiveNumber(parsed.potencia_p4_kw),
    potencia_p5_kw: safePositiveNumber(parsed.potencia_p5_kw),
    potencia_p6_kw: safePositiveNumber(parsed.potencia_p6_kw),
    precio_energia_kwh: safePositiveNumber(parsed.precio_energia_kwh),
    precio_p1_kwh: safePositiveNumber(parsed.precio_p1_kwh),
    precio_p2_kwh: safePositiveNumber(parsed.precio_p2_kwh),
    precio_p3_kwh: safePositiveNumber(parsed.precio_p3_kwh),
    precio_p4_kwh: safePositiveNumber(parsed.precio_p4_kwh),
    precio_p5_kwh: safePositiveNumber(parsed.precio_p5_kwh),
    precio_p6_kwh: safePositiveNumber(parsed.precio_p6_kwh),
    consumo_p1_kwh: safeNonNegativeNumber(parsed.consumo_p1_kwh),
    consumo_p2_kwh: safeNonNegativeNumber(parsed.consumo_p2_kwh),
    consumo_p3_kwh: safeNonNegativeNumber(parsed.consumo_p3_kwh),
    consumo_p4_kwh: safeNonNegativeNumber(parsed.consumo_p4_kwh),
    consumo_p5_kwh: safeNonNegativeNumber(parsed.consumo_p5_kwh),
    consumo_p6_kwh: safeNonNegativeNumber(parsed.consumo_p6_kwh),
    tipo_tarifa: safeString(parsed.tipo_tarifa),
    cups: safeCups(parsed.cups),
    titular: safeString(parsed.titular),
    direccion_suministro: safeString(parsed.direccion_suministro),
  };
}

function safeString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  return null;
}

/** "1.473,059" → 1473.059 ; "553,714" → 553.714 ; "714,000" → 714 */
function parseSpanishNumberString(s: string): number | null {
  const t = s.trim().replace(/\s/g, '');
  if (t === '' || t === '-') return null;
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');
  let norm = t;
  if (hasComma && hasDot) {
    norm = t.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    norm = t.replace(',', '.');
  }
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function safePositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseSpanishNumberString(v);
    if (n != null && n > 0) return n;
  }
  return null;
}

function safeNonNegativeNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const n = parseSpanishNumberString(v);
    if (n != null && n >= 0) return n;
  }
  return null;
}

function safePeriodMonths(v: unknown, start: string | null, end: string | null): number {
  if (typeof v === 'number' && v >= 1 && v <= 12) return Math.round(v);

  if (start && end) {
    try {
      const s = new Date(start);
      const e = new Date(end);
      const diffMs = e.getTime() - s.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 0) {
        const months = Math.round(diffDays / 30);
        if (months >= 1 && months <= 12) return months;
      }
    } catch { /* ignore */ }
  }

  return 1;
}

function safeCups(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().toUpperCase().replace(/\s/g, '');
  if (/^ES\d{16}[A-Z]{2}$/.test(cleaned)) return cleaned;
  if (/^ES\d{16}$/.test(cleaned)) return cleaned;
  return cleaned.length >= 18 ? cleaned : null;
}
