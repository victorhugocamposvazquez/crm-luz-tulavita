/**
 * Extracción de datos de facturas energéticas españolas mediante GPT-4o Vision.
 *
 * Dos caminos según tarifa:
 *  - 2.0TD: prompt ligero + gpt-4o-mini (rápido, barato, fiable para facturas simples).
 *  - 3.0TD: prompt completo + gpt-4o-mini → fallback gpt-4o → retry si consumo sospechoso.
 *
 * Usa la Responses API de OpenAI que soporta PDFs nativamente.
 */

import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL_FAST = 'gpt-4o-mini';
const MODEL_FULL = 'gpt-4o';
const CONFIDENCE_THRESHOLD = Number(process.env.INVOICE_LLM_CONFIDENCE_THRESHOLD ?? '0.7') || 0.7;

const MAX_TOKENS_20TD = 500;
const MAX_TOKENS_30TD = 2000;
/** Tope de texto enviado al LLM en 2.0TD (menos tokens → menos latencia). */
const MAX_TEXT_CHARS_20TD = 5_500;

// ────────────────────────────────────────────────────────────
// Sección compartida de formato numérico
// ────────────────────────────────────────────────────────────
const NUMERO_ESPANOL_BLOQUE = `FORMATO NUMÉRICO ESPAÑOL — CRÍTICO:
En España: PUNTO = separador de miles, COMA = separador decimal.
- "714,000 kWh" → 714.0 (NO 714000)
- "1.473,059 kWh" → 1473.059
- "26,000 kW" → 26.0 (NO 26000)
- "835,00 €" → 835.00
- "0,219748" → 0.219748
Regla: si ves "NNN,NNN" con 3 decimales tras la coma, los 3 dígitos SON decimales.`;

// ────────────────────────────────────────────────────────────
// PROMPT 2.0TD — ligero (~2500 chars), solo P1-P2
// ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_20TD = `Eres un experto en facturas de energía eléctrica en España. Extrae datos estructurados de una factura 2.0TD (doméstica, 2 periodos).

INSTRUCCIONES:
1. Analiza todas las páginas.
2. Convierte números del formato español (coma decimal) a punto decimal.
3. Dato no visible → null.
4. Responde SOLO con JSON válido, sin texto, sin markdown.

${NUMERO_ESPANOL_BLOQUE}

ESQUEMA JSON:
{
  "company_name": "string",
  "consumption_kwh": number,
  "total_factura": number,
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "period_months": number,
  "potencia_contratada_kw": number,
  "potencia_p1_kw": number, "potencia_p2_kw": number,
  "precio_energia_kwh": number,
  "precio_p1_kwh": number, "precio_p2_kwh": number,
  "consumo_p1_kwh": number, "consumo_p2_kwh": number,
  "tipo_tarifa": "2.0TD",
  "cups": "string",
  "titular": "string",
  "direccion_suministro": "string"
}

EXTRACCIÓN:
- tipo_tarifa: siempre "2.0TD" (esta factura es 2.0TD).
- consumption_kwh: consumo total kWh = consumo_p1_kwh + consumo_p2_kwh.
- total_factura: importe TOTAL a pagar (IVA incluido).
- potencia_contratada_kw: potencia de P1 (en 2.0TD P1≈P2).
- potencia_p1_kw, potencia_p2_kw: potencia contratada por periodo.
- precio_p1_kwh, precio_p2_kwh: €/kWh de energía activa por periodo.
- precio_energia_kwh: media ponderada = (consumo_p1×precio_p1 + consumo_p2×precio_p2) / consumption_kwh.
- period_start, period_end: fechas del periodo facturado (YYYY-MM-DD).
- cups: código ES + 16 dígitos + 2 letras.
- company_name: nombre comercial (Endesa, Iberdrola, Naturgy, Repsol, etc.)

VERIFICACIÓN:
1. consumption_kwh == consumo_p1_kwh + consumo_p2_kwh. Si no, corrige.
2. precio_energia_kwh debe estar entre 0.05 y 0.35 €/kWh.
3. NO incluyas P3–P6 en el JSON (esta tarifa solo tiene 2 periodos).`;

// ────────────────────────────────────────────────────────────
// PROMPT 3.0TD — completo (~4500 chars), P1-P6, bloques múltiples
// ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_30TD = `Eres un experto en facturas de energía eléctrica en España. Extrae datos estructurados de una factura 3.0TD (empresa/gran consumo, 6 periodos).

INSTRUCCIONES:
1. Analiza TODAS las páginas de principio a fin, sin saltarte ninguna tabla.
2. Convierte números del formato español (coma decimal) a punto decimal.
3. Dato no visible → null. Periodo sin consumo → 0 (NO null).
4. Responde SOLO con JSON válido, sin texto, sin markdown.

${NUMERO_ESPANOL_BLOQUE}

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

POTENCIA CONTRATADA:
- Lee CADA fila P1…P6 individualmente. potencia_contratada_kw = P1.
- En 3.0TD es frecuente que P1–P5 tengan un valor (ej. 26 kW) y P6 otro distinto (ej. 33 kW). NO copies el mismo a los 6.

*** CONSUMO DE ENERGÍA — LO MÁS IMPORTANTE ***
Las facturas 3.0TD casi siempre tienen DOS O MÁS BLOQUES de energía activa, separados por fechas distintas (ej. días 1–24 y 25–31, por cambio de precio regulado). Pueden estar en la MISMA o en DISTINTAS páginas.

PROCEDIMIENTO OBLIGATORIO:
1. Recorre TODAS las páginas buscando TODAS las tablas de "energía activa" / "Término de energía".
2. Para cada periodo Px: SUMA los kWh de TODOS los bloques.
3. Para precios (precio_pX_kwh): usa el del bloque con más kWh o más días.
4. Periodo sin consumo en ningún bloque → 0 (NO null).
5. consumption_kwh = suma de consumo_p1 a consumo_p6.
6. importe_energia_activa = suma de TODOS los importes (€) de energía activa. Busca "Total energía activa" o suma las filas.
7. importe_potencia = suma de importes del término de potencia.

PRECIO MEDIO:
- precio_energia_kwh = Σ(consumo_pX × precio_pX) / consumption_kwh. Debe estar entre 0.05 y 0.35.
- Contraverificación: importe_energia_activa / consumption_kwh ≈ precio_energia_kwh.

DATOS GENERALES:
- total_factura: importe TOTAL a pagar (IVA incluido).
- period_start, period_end: fechas del periodo facturado.
- cups: código ES + 16 dígitos + 2 letras.
- company_name: nombre comercial de la comercializadora.

VERIFICACIÓN FINAL — OBLIGATORIA:
1. consumption_kwh == suma P1…P6. Si no cuadra, corrige.
2. total_factura / consumption_kwh: si > 0.40 €/kWh, FALTA CONSUMO — busca más tablas de energía.
3. importe_energia_activa / consumption_kwh: si > 0.35, falta consumo.
4. ¿Leíste TODOS los bloques de energía (suelen ser 2-3)?
5. ¿potencia_p6_kw distinta de P1 si la factura lo indica?`;

/** Prompt genérico cuando no se conoce la tarifa de antemano. */
const SYSTEM_PROMPT_GENERIC = `Eres un experto en facturas de energía eléctrica en España. Extrae datos estructurados.

INSTRUCCIONES:
1. Analiza todas las páginas o toda la imagen.
2. Convierte números del formato español (coma decimal) a punto decimal.
3. Responde SOLO con JSON válido, sin texto, sin markdown.

${NUMERO_ESPANOL_BLOQUE}

REGLA CRÍTICA PARA DETERMINAR LA TARIFA:
- Determina "tipo_tarifa" SOLO por una etiqueta explícita visible en la factura: "2.0TD", "3.0TD", "2.0A", "3.0A", "Peaje de transporte y distribución", "Peaje de acceso", "ATR".
- Si ves explícitamente "2.0TD", entonces la tarifa es 2.0TD aunque aparezcan términos como "P3", "Valle", "punta/llano/valle" o lecturas desagregadas.
- En algunas facturas 2.0TD el detalle regulatorio usa "P3" para el componente valle o para lecturas internas; ESO NO la convierte en 3.0TD.
- NO infieras 3.0TD solo porque aparezca "P3" en una línea de potencia o consumos. Para 3.0TD debe verse explícitamente "3.0TD" / "3.0A" o una estructura clara P1...P6 en la propia tarifa.

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

SI LA TARIFA EXPLÍCITA ES 2.0TD:
- Prioriza P1 y P2.
- Si aparece P3 solo como detalle regulatorio/valle, no clasifiques como 3.0TD.

SI LA TARIFA EXPLÍCITA ES 3.0TD:
- Usa P1...P6 y suma todos los bloques de energía activa si hay varios.
`;

/** Prompt genérico de compatibilidad (usado si no se puede pre-clasificar). */
const SYSTEM_PROMPT = SYSTEM_PROMPT_GENERIC;

const USER_PROMPT = 'Extrae todos los datos de esta factura de energía. Devuelve SOLO el JSON, sin explicaciones.';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface ResponsesAPIInput {
  type: string;
  [key: string]: unknown;
}

interface CallOptions {
  systemPrompt: string;
  maxTokens: number;
}

const KEYWORDS_20TD = [
  /2[\.\s]?0\s*TD/gi,
  /CUPS/gi,
  /Total factura/gi,
  /TOTAL IMPORTE FACTURA/gi,
  /IMPORTE TOTAL/gi,
  /Consumo Total/gi,
  /Consumo en este periodo/gi,
  /Periodo de facturaci[oó]n/gi,
  /Potencias contratadas/gi,
  /Potencia contratada/gi,
  /Potencia punta/gi,
  /Potencia valle/gi,
  /(?:€|Eur)\/kWh/gi,
  /ha salido a/gi,
  /Titular/gi,
  /Nombre y Apellidos del titular/gi,
  /Direcci[oó]n de suministro/gi,
  /Peaje de transporte y distribuci[oó]n/gi,
];

function normalize20TDInputText(text: string): string {
  return text
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ ]*\n[ ]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function mergeRanges(ranges: Array<[number, number]>, maxLength: number): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges]
    .map(([start, end]) => [Math.max(0, start), Math.min(maxLength, end)] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
    } else {
      merged.push([...current] as [number, number]);
    }
  }
  return merged;
}

export function select20TDTextForLLM(text: string): string {
  const normalized = normalize20TDInputText(text);
  if (normalized.length <= MAX_TEXT_CHARS_20TD) return normalized;

  const ranges: Array<[number, number]> = [[0, Math.min(normalized.length, 1800)]];
  for (const regex of KEYWORDS_20TD) {
    for (const match of normalized.matchAll(regex)) {
      if (match.index == null) continue;
      const start = Math.max(0, match.index - 260);
      const end = Math.min(normalized.length, match.index + match[0].length + 520);
      ranges.push([start, end]);
    }
  }

  const merged = mergeRanges(ranges, normalized.length);
  const selected = merged
    .map(([start, end]) => normalized.slice(start, end).trim())
    .filter(Boolean)
    .join('\n...\n');

  if (selected.length >= 1600) {
    return selected.length > MAX_TEXT_CHARS_20TD ? selected.slice(0, MAX_TEXT_CHARS_20TD) : selected;
  }

  return normalized.slice(0, MAX_TEXT_CHARS_20TD);
}

function readResponseOutput(
  data: {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    output_text?: string;
  },
): string | null {
  return data.output_text
    ?? data.output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text
    ?? null;
}

async function callResponsesAPI(
  fileBuffer: Buffer,
  mimeType: string,
  model: string,
  apiKey: string,
  opts?: CallOptions,
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

  const prompt = opts?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTokens = opts?.maxTokens ?? MAX_TOKENS_30TD;

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: prompt,
      input: [{ role: 'user', content }],
      max_output_tokens: maxTokens,
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

  const raw = readResponseOutput(data);

  if (!raw) {
    console.error(`[llm-extract] No text in response (${model}):`, JSON.stringify(data).slice(0, 300));
    return emptyExtraction();
  }

  return parseLLMResponse(raw.trim());
}

async function callResponsesAPIText(
  text: string,
  model: string,
  apiKey: string,
  opts?: CallOptions,
): Promise<InvoiceExtraction> {
  const prompt = opts?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTokens = opts?.maxTokens ?? MAX_TOKENS_30TD;
  const clippedText = text.length > 24_000 ? text.slice(0, 24_000) : text;

  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: prompt,
      input: [{
        role: 'user',
        content: [
          { type: 'input_text', text: USER_PROMPT },
          { type: 'input_text', text: `TEXTO EXTRAIDO DE PDF:\n${clippedText}` },
        ],
      }],
      max_output_tokens: maxTokens,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[llm-extract-text] OpenAI API error (${model})`, res.status, errText.slice(0, 500));
    return emptyExtraction();
  }

  const data = (await res.json()) as {
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    output_text?: string;
  };

  const raw = readResponseOutput(data);
  if (!raw) {
    console.error(`[llm-extract-text] No text in response (${model}):`, JSON.stringify(data).slice(0, 300));
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
 * Camino rápido para 2.0TD: solo gpt-4o-mini con prompt ligero.
 * Sin fallback ni retry (las 2.0TD son simples y salen bien a la primera).
 */
export async function extractWithLLM20TD(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_20TD, maxTokens: MAX_TOKENS_20TD };
  const t0 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, opts);
  result.confidence = computeConfidence(result);
  if (!result.tipo_tarifa) result.tipo_tarifa = '2.0TD';
  nullify30TDFields(result);
  console.log(`[llm-extract] 2.0TD gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)})`);
  return result;
}

/**
 * Camino ultrarrápido para 2.0TD cuando ya tenemos el texto del PDF.
 * Evita enviar el PDF binario a OpenAI y reduce mucho la latencia.
 */
export async function extractWithLLM20TDFromText(
  text: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_20TD, maxTokens: MAX_TOKENS_20TD };
  const t0 = Date.now();
  const preparedText = select20TDTextForLLM(text);
  const result = await callResponsesAPIText(preparedText, MODEL_FAST, apiKey, opts);
  result.confidence = computeConfidence(result);
  if (!result.tipo_tarifa) result.tipo_tarifa = '2.0TD';
  nullify30TDFields(result);
  console.log(`[llm-extract] 2.0TD text gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)}, chars=${preparedText.length})`);
  return result;
}

/**
 * Camino robusto para 3.0TD: gpt-4o-mini → fallback gpt-4o si confianza baja.
 */
export async function extractWithLLM30TD(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_30TD, maxTokens: MAX_TOKENS_30TD };

  const tFast = Date.now();
  const fast = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, opts);
  fast.confidence = computeConfidence(fast);
  console.log(`[llm-extract] 3.0TD gpt-4o-mini in ${Date.now() - tFast}ms (confidence: ${fast.confidence.toFixed(2)})`);

  if (fast.confidence >= CONFIDENCE_THRESHOLD) {
    return fast;
  }

  const noFallback = process.env.INVOICE_LLM_DISABLE_FALLBACK === '1'
    || process.env.INVOICE_LLM_DISABLE_FALLBACK === 'true';
  if (noFallback) {
    console.log('[llm-extract] 3.0TD fallback desactivado, devolviendo mini');
    return fast;
  }

  console.log(`[llm-extract] 3.0TD gpt-4o-mini bajo umbral (${fast.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}), fallback gpt-4o...`);
  const tFull = Date.now();
  const full = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey, opts);
  full.confidence = computeConfidence(full);
  console.log(`[llm-extract] 3.0TD gpt-4o in ${Date.now() - tFull}ms (confidence: ${full.confidence.toFixed(2)})`);

  return full.confidence >= fast.confidence ? full : fast;
}

/** Camino genérico cuando la tarifa no se ha podido pre-detectar. */
export async function extractWithLLMGeneric(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_GENERIC, maxTokens: MAX_TOKENS_30TD };
  const t0 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, opts);
  result.confidence = computeConfidence(result);
  console.log(`[llm-extract] generic gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)})`);
  return result;
}

/**
 * Fuerza extracción 3.0TD con gpt-4o (modelo completo).
 * Usado por el pipeline cuando gpt-4o-mini produce consumo sospechoso.
 */
export async function extractWithLLMForceFull(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract-force-full] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_30TD, maxTokens: MAX_TOKENS_30TD };
  const t0 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey, opts);
  result.confidence = computeConfidence(result);
  console.log(`[llm-extract] 3.0TD gpt-4o forced retry in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)})`);
  return result;
}

/**
 * Extrae con el prompt genérico completo (compatibilidad).
 * Usado cuando no se sabe la tarifa de antemano.
 */
export async function extractWithLLM(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  return extractWithLLMGeneric(fileBuffer, mimeType);
}

/** Limpia campos P3-P6 para 2.0TD (el LLM a veces rellena campos que no corresponden). */
function nullify30TDFields(e: InvoiceExtraction): void {
  e.potencia_p3_kw = null;
  e.potencia_p4_kw = null;
  e.potencia_p5_kw = null;
  e.potencia_p6_kw = null;
  e.precio_p3_kwh = null;
  e.precio_p4_kwh = null;
  e.precio_p5_kwh = null;
  e.precio_p6_kwh = null;
  e.consumo_p3_kwh = null;
  e.consumo_p4_kwh = null;
  e.consumo_p5_kwh = null;
  e.consumo_p6_kwh = null;
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
        { role: 'system', content: SYSTEM_PROMPT_30TD },
        { role: 'user', content },
      ],
      max_tokens: MAX_TOKENS_30TD,
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
