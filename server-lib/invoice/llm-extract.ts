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
  const n = raw != null && raw !== '' ? Number(raw) : 1400;
  return Math.min(4096, Math.max(800, Number.isFinite(n) ? n : 1400));
})();

const SYSTEM_PROMPT = `Eres un experto en facturas de energía eléctrica y gas en España. Tu trabajo es extraer datos estructurados de facturas.

INSTRUCCIONES:
1. Analiza TODAS las páginas de la factura.
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
- "130,286 kWh" → 130.286
Regla: si ves "NNN,NNN" con 3 decimales tras la coma, los 3 dígitos tras la coma SON decimales (ej: "714,000" = 714.000 = 714.0).

ESQUEMA JSON:
{
  "company_name": "string",
  "consumption_kwh": number,
  "total_factura": number,
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
- Extrae la potencia (kW) de CADA FILA P1…P6. NO copies el mismo valor a los 6 sin leer: es un error típico.
- potencia_contratada_kw = potencia de P1.
- Ejemplo frecuente en 3.0TD: P1=P2=P3=P4=P5=26.0 kW y P6=33.0 kW (u otro distinto). Si la fila P6 dice 33,000 kW → 33.0, no 26.0.

PASO 3 — CONSUMO Y PRECIOS DE ENERGÍA:
- Busca "Término de energía activa", "Consumo", "Energía activa".
- IMPORTANTE: Puede haber VARIOS BLOQUES TEMPORALES para el mismo periodo de facturación (ej: "entre 01/12 y 24/12" + "entre 25/12 y 31/12"). Esto pasa por cambios regulatorios. DEBES SUMAR los kWh de todos los bloques para cada periodo.
- Ejemplo con 2 bloques (un mes dado; otro mes puede activar otros periodos):
    Bloque 1 (01/12-24/12): P1=714.0, P2=553.714, P6=1473.059
    Bloque 2 (25/12-31/12): P1=168.0, P2=130.286, P6=503.941
    → consumo_p1_kwh = 882.0, p2 = 684.0, p3–p5 = 0 (no aplican ese mes), p6 = 1977.0
    → consumption_kwh = suma de los seis = 3543.0
- consumption_kwh = SUMA TOTAL de consumo_p1 a consumo_p6.
- consumo_p1_kwh a consumo_p6_kwh: consumo en kWh por periodo, SUMANDO todos los bloques temporales. En 3.0TD el calendario horario (mes, estación) determina qué periodos tienen energía en ese mes: cualquier P puede ser 0 o no aparecer en factura — pon 0 (NO null) si no hay consumo.
- Para precio_p1_kwh a precio_p6_kwh: extrae €/kWh solo donde la factura muestre línea de energía activa para ese periodo. Si hay 2 bloques temporales, prioriza precios del bloque con más días. Si un periodo no tiene fila (consumo 0 en ese mes), null salvo que el otro bloque aporte precio útil.

PASO 4 — PRECIO MEDIO:
- precio_energia_kwh = suma(consumo_pX_kwh × precio_pX_kwh) / consumption_kwh (media ponderada por periodo). Si falta algún precio para un periodo con consumo > 0, no inventes.
- Debe quedar entre 0.05 y 0.35 €/kWh aprox. NO uses total_factura/consumption_kwh (eso mezcla potencia, impuestos e IVA).

PASO 5 — DATOS GENERALES:
- "total_factura": importe TOTAL a pagar (IVA incluido). Busca "Total factura", "Total a pagar".
- "period_start" y "period_end": fechas del periodo facturado (ej. 2025-12-01 a 2025-12-31). NO confundas con fechas de lectura ni con "30/11" si el periodo es diciembre completo: el inicio suele ser día 1 del mes facturado.
- "period_months": calcula de las fechas. 01/12/2025 a 31/12/2025 = 1 mes. 01/11 a 31/12 = 2 meses.
- "cups": código que empieza por ES + 16 dígitos + 2 letras (ej: ES0021000049650681D).
- "titular": nombre del titular del contrato.
- "direccion_suministro": dirección completa del punto de suministro.
- "company_name": normaliza (Iberdrola, Endesa, Naturgy, Repsol, EDP, Total Energies, Plenitude, Holaluz, Octopus, Cepsa, Viesgo, Fenie Energía, Gaba Energía, Contigo Energía, etc.)

VERIFICACIÓN FINAL — OBLIGATORIA:
1. total_factura / consumption_kwh NO es el precio del kWh de energía (incluye potencia, impuestos, IVA). Solo úsalo para detectar consumo mal sumado: si da > 0.55, revisa consumo y decimales españoles.
2. precio_energia_kwh debe coincidir con la media ponderada Σ(consumo_pX × precio_pX) / consumption_kwh (periodos con precio null no entran en la suma del numerador).
3. Si 3.0TD: ¿potencia_p6_kw es distinta de P1 si la factura lo indica? ¿Los 6 precios o null solo donde no hay dato en factura?
4. Si 2.0TD: P3 a P6 null en potencia, consumo y precio.
5. period_start: ¿es el primer día del periodo facturado (ej. 01/12) y no víspera errónea (30/11)?`;

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

function safePositiveNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function safeNonNegativeNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    if (Number.isFinite(n) && n >= 0) return n;
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
