/**
 * Extracción de facturas eléctricas vía OpenAI Responses API.
 * Prioridad: texto filtrado (pocas tokens) → solo si falla validación, PDF/imagen (input_file / input_image).
 */

import type { InvoiceExtraction } from './types.js';
import { emptyExtraction } from './types.js';
import {
  extractRelevantText,
  EXTRACT_RELEVANT_MAX_CHARS_20TD,
  EXTRACT_RELEVANT_MAX_CHARS_30TD,
} from './extract-relevant-text.js';
import { extractTextFromPdf } from './pdf-text.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MODEL_FAST = 'gpt-4o-mini';
const MODEL_FULL = 'gpt-4o';
const CONFIDENCE_THRESHOLD = Number(process.env.INVOICE_LLM_CONFIDENCE_THRESHOLD ?? '0.7') || 0.7;

/** Salida JSON compacta. */
const MAX_TOKENS_20TD = 300;
const MAX_TOKENS_30TD = 700;
const MAX_TOKENS_30TD_PDF_FALLBACK = 900;
/** Tope de seguridad si llegara texto sin filtrar. */
const MAX_INPUT_TEXT_CHARS = 8_000;

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
// PROMPT 2.0TD — mínimo (menos tokens)
// ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_20TD = `Extractor JSON factura eléctrica 2.0TD España. ${NUMERO_ESPANOL_BLOQUE}
Salida: SOLO JSON, sin markdown ni texto.
Campos: company_name, consumption_kwh, total_factura (IVA incl.), period_start/end YYYY-MM-DD, period_months, potencia_contratada_kw, potencia_p1_kw, potencia_p2_kw, precio_energia_kwh, precio_p1_kwh, precio_p2_kwh, consumo_p1_kwh, consumo_p2_kwh, tipo_tarifa "2.0TD", cups, titular, direccion_suministro.
Reglas: consumption_kwh = p1+p2; precio_energia_kwh media ponderada; sin P3-P6; null si no consta.`;

// ────────────────────────────────────────────────────────────
// PROMPT 3.0TD — mínimo
// ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT_30TD = `Extractor JSON factura 3.0TD España. ${NUMERO_ESPANOL_BLOQUE}
Salida: SOLO JSON, sin markdown.
Campos: company_name, consumption_kwh, total_factura, importe_energia_activa, importe_potencia, period_start/end, period_months, potencia_contratada_kw, potencia_p1…p6_kw, precio_energia_kwh, precio_p1…p6_kwh, consumo_p1…p6_kwh (0 si sin consumo), tipo_tarifa, cups, titular, direccion_suministro.
Crítico: puede haber VARIOS bloques de energía por fechas; SUMA kWh por P1-P6 entre bloques. consumption_kwh = suma p1-p6. potencia_p6 puede diferir de p1.`;

const SYSTEM_PROMPT_GENERIC = `Extractor JSON factura eléctrica España. ${NUMERO_ESPANOL_BLOQUE}
Salida: SOLO JSON. tipo_tarifa solo si consta explícito 2.0TD/3.0TD o peaje; 2.0TD no es 3.0TD por tener "P3" en una línea suelta.
Mismo esquema completo P1-P6 (null o 0 según tarifa real).`;

const SYSTEM_PROMPT = SYSTEM_PROMPT_GENERIC;

const USER_PROMPT = 'Extrae los datos en JSON según instructions. Sin explicaciones.';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface ResponsesAPIInput {
  type: string;
  [key: string]: unknown;
}

interface CallOptions {
  systemPrompt: string;
  maxTokens: number;
}

/** Alias de `extractRelevantText` para 2.0TD (tests y callers legacy). */
export function select20TDTextForLLM(text: string): string {
  return extractRelevantText(text, EXTRACT_RELEVANT_MAX_CHARS_20TD);
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

async function getPdfTextFromBuffer(buffer: Buffer): Promise<string | null> {
  const r = await extractTextFromPdf(buffer);
  return r?.text ?? null;
}

function needsLlmPdfFallback20(e: InvoiceExtraction): boolean {
  return !(
    e.consumption_kwh != null && e.consumption_kwh > 0
    && e.total_factura != null && e.total_factura > 0
    && e.cups != null
  );
}

function is30TDType(tipo: string | null | undefined): boolean {
  const t = (tipo ?? '').toUpperCase().replace(/\s+/g, '');
  return t.includes('3.0') || t.includes('30TD') || t.includes('30A');
}

function needsLlmPdfFallback30(e: InvoiceExtraction): boolean {
  if (needsLlmPdfFallback20(e)) return true;
  if (!is30TDType(e.tipo_tarifa)) return true;
  const potCount = [e.potencia_p1_kw, e.potencia_p2_kw, e.potencia_p3_kw, e.potencia_p4_kw, e.potencia_p5_kw, e.potencia_p6_kw]
    .filter((v) => v != null).length;
  if (potCount < 3) return true;
  const hasConsumoPx = [e.consumo_p1_kwh, e.consumo_p2_kwh, e.consumo_p3_kwh, e.consumo_p4_kwh, e.consumo_p5_kwh, e.consumo_p6_kwh]
    .some((v) => v != null && v > 0);
  if (!hasConsumoPx) return true;
  return false;
}

/** Fallback explícito: PDF base64 o imagen (más lento, más tokens). */
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

/** Camino rápido: solo texto (input_text), sin input_file. */
async function callResponsesAPIText(
  text: string,
  model: string,
  apiKey: string,
  opts?: CallOptions,
): Promise<InvoiceExtraction> {
  const prompt = opts?.systemPrompt ?? SYSTEM_PROMPT;
  const maxTokens = opts?.maxTokens ?? MAX_TOKENS_30TD;
  const clippedText = text.length > MAX_INPUT_TEXT_CHARS ? text.slice(0, MAX_INPUT_TEXT_CHARS) : text;

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
          { type: 'input_text', text: `FACTURA (texto):\n${clippedText}` },
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
  return is30TDType(e.tipo_tarifa);
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
 * 2.0TD: PDF → texto filtrado → LLM (rápido); si faltan campos críticos → PDF (input_file).
 * Imágenes: solo visión (input_image).
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

  if (mimeType === 'application/pdf') {
    const raw = await getPdfTextFromBuffer(fileBuffer);
    if (raw) {
      const prepared = extractRelevantText(raw, EXTRACT_RELEVANT_MAX_CHARS_20TD);
      const t0 = Date.now();
      const textResult = await callResponsesAPIText(prepared, MODEL_FAST, apiKey, opts);
      textResult.confidence = computeConfidence(textResult);
      if (!textResult.tipo_tarifa) textResult.tipo_tarifa = '2.0TD';
      nullify30TDFields(textResult);
      if (!needsLlmPdfFallback20(textResult)) {
        console.log(`[llm-extract] 2.0TD text-only in ${Date.now() - t0}ms (confidence: ${textResult.confidence.toFixed(2)})`);
        return textResult;
      }
      console.log('[llm-extract] 2.0TD texto insuficiente → fallback PDF');
    }
  }

  const t1 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, opts);
  result.confidence = computeConfidence(result);
  if (!result.tipo_tarifa) result.tipo_tarifa = '2.0TD';
  nullify30TDFields(result);
  console.log(`[llm-extract] 2.0TD file gpt-4o-mini in ${Date.now() - t1}ms (confidence: ${result.confidence.toFixed(2)})`);
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
  const preparedText = extractRelevantText(text, EXTRACT_RELEVANT_MAX_CHARS_20TD);
  const result = await callResponsesAPIText(preparedText, MODEL_FAST, apiKey, opts);
  result.confidence = computeConfidence(result);
  if (!result.tipo_tarifa) result.tipo_tarifa = '2.0TD';
  nullify30TDFields(result);
  console.log(`[llm-extract] 2.0TD text gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)}, chars=${preparedText.length})`);
  return result;
}

/**
 * 3.0TD: texto filtrado → mini; si validación/confianza floja → PDF (input_file) mini;
 * si sigue bajo umbral → gpt-4o con PDF. Imágenes: archivo directo (misma escalera).
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
  const optsText: CallOptions = { systemPrompt: SYSTEM_PROMPT_30TD, maxTokens: MAX_TOKENS_30TD };
  const optsPdf: CallOptions = { systemPrompt: SYSTEM_PROMPT_30TD, maxTokens: MAX_TOKENS_30TD_PDF_FALLBACK };

  const noFallback = process.env.INVOICE_LLM_DISABLE_FALLBACK === '1'
    || process.env.INVOICE_LLM_DISABLE_FALLBACK === 'true';

  const tryFullModel = async (after: InvoiceExtraction): Promise<InvoiceExtraction> => {
    if (noFallback) return after;
    console.log(`[llm-extract] 3.0TD bajo umbral (${after.confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}), fallback gpt-4o...`);
    const tFull = Date.now();
    const full = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey, optsPdf);
    full.confidence = computeConfidence(full);
    console.log(`[llm-extract] 3.0TD gpt-4o in ${Date.now() - tFull}ms (confidence: ${full.confidence.toFixed(2)})`);
    return full.confidence >= after.confidence ? full : after;
  };

  if (mimeType === 'application/pdf') {
    const raw = await getPdfTextFromBuffer(fileBuffer);
    if (raw && raw.length > 80) {
      const prepared = extractRelevantText(raw, EXTRACT_RELEVANT_MAX_CHARS_30TD);
      const tFast = Date.now();
      let fast = await callResponsesAPIText(prepared, MODEL_FAST, apiKey, optsText);
      fast.confidence = computeConfidence(fast);
      console.log(`[llm-extract] 3.0TD text gpt-4o-mini in ${Date.now() - tFast}ms (confidence: ${fast.confidence.toFixed(2)})`);

      if (fast.confidence >= CONFIDENCE_THRESHOLD && !needsLlmPdfFallback30(fast)) {
        return fast;
      }

      if (noFallback) return fast;

      const tPdf = Date.now();
      const pdfMini = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, optsPdf);
      pdfMini.confidence = computeConfidence(pdfMini);
      console.log(`[llm-extract] 3.0TD PDF mini fallback in ${Date.now() - tPdf}ms (confidence: ${pdfMini.confidence.toFixed(2)})`);

      const best = pdfMini.confidence >= fast.confidence ? pdfMini : fast;
      if (best.confidence >= CONFIDENCE_THRESHOLD && !needsLlmPdfFallback30(best)) {
        return best;
      }
      return tryFullModel(best);
    }
  }

  const tFast = Date.now();
  const fast = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, optsPdf);
  fast.confidence = computeConfidence(fast);
  console.log(`[llm-extract] 3.0TD file gpt-4o-mini in ${Date.now() - tFast}ms (confidence: ${fast.confidence.toFixed(2)})`);

  if (fast.confidence >= CONFIDENCE_THRESHOLD) {
    return fast;
  }

  if (noFallback) return fast;

  return tryFullModel(fast);
}

function needsLlmPdfFallbackGeneric(e: InvoiceExtraction): boolean {
  if (needsLlmPdfFallback20(e)) return true;
  if (is30TDType(e.tipo_tarifa)) return needsLlmPdfFallback30(e);
  return false;
}

/** Camino genérico: texto filtrado primero; PDF si validación floja. */
export async function extractWithLLMGeneric(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[llm-extract] OPENAI_API_KEY not set');
    return emptyExtraction();
  }
  const optsText: CallOptions = { systemPrompt: SYSTEM_PROMPT_GENERIC, maxTokens: MAX_TOKENS_30TD };
  const optsPdf: CallOptions = { systemPrompt: SYSTEM_PROMPT_GENERIC, maxTokens: MAX_TOKENS_30TD_PDF_FALLBACK };

  if (mimeType === 'application/pdf') {
    const raw = await getPdfTextFromBuffer(fileBuffer);
    if (raw && raw.length > 80) {
      const prepared = extractRelevantText(raw, EXTRACT_RELEVANT_MAX_CHARS_30TD);
      const t0 = Date.now();
      const textR = await callResponsesAPIText(prepared, MODEL_FAST, apiKey, optsText);
      textR.confidence = computeConfidence(textR);
      console.log(`[llm-extract] generic text gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${textR.confidence.toFixed(2)})`);
      if (!needsLlmPdfFallbackGeneric(textR) && textR.confidence >= 0.35) {
        return textR;
      }
      const t1 = Date.now();
      const pdfR = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, optsPdf);
      pdfR.confidence = computeConfidence(pdfR);
      console.log(`[llm-extract] generic PDF fallback in ${Date.now() - t1}ms (confidence: ${pdfR.confidence.toFixed(2)})`);
      return pdfR.confidence >= textR.confidence ? pdfR : textR;
    }
  }

  const t0 = Date.now();
  const result = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey, optsPdf);
  result.confidence = computeConfidence(result);
  console.log(`[llm-extract] generic file gpt-4o-mini in ${Date.now() - t0}ms (confidence: ${result.confidence.toFixed(2)})`);
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
  const opts: CallOptions = { systemPrompt: SYSTEM_PROMPT_30TD, maxTokens: MAX_TOKENS_30TD_PDF_FALLBACK };
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
