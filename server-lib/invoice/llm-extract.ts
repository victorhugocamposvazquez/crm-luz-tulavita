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
const CONFIDENCE_THRESHOLD = 0.7;
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `Eres un experto en facturas de energía eléctrica y gas en España. Tu trabajo es extraer datos estructurados de facturas.

INSTRUCCIONES:
1. Analiza TODAS las páginas de la factura.
2. Extrae los datos con la mayor precisión posible.
3. Los decimales en España usan COMA (ej: "1.234,56" = 1234.56). Convierte siempre a formato numérico con punto decimal.
4. Si un dato no aparece o no es legible, usa null.
5. Responde EXCLUSIVAMENTE con un JSON válido, sin texto adicional, sin markdown, sin backticks.

ESQUEMA JSON A DEVOLVER:
{
  "company_name": "Nombre comercializadora (Iberdrola, Endesa, Naturgy, Repsol...)",
  "consumption_kwh": 123.45,
  "total_factura": 89.50,
  "period_start": "2025-01-01",
  "period_end": "2025-01-31",
  "period_months": 1,
  "potencia_contratada_kw": 4.6,
  "potencia_p1_kw": 4.6,
  "potencia_p2_kw": 4.6,
  "potencia_p3_kw": null,
  "precio_energia_kwh": 0.15,
  "precio_p1_kwh": 0.18,
  "precio_p2_kwh": 0.12,
  "precio_p3_kwh": null,
  "tipo_tarifa": "2.0TD",
  "cups": "ES0021000012345678AB",
  "titular": "Juan Pérez García",
  "direccion_suministro": "Calle Mayor 5, 2ºB, 28001 Madrid"
}

NOTAS IMPORTANTES:
- "consumption_kwh": consumo TOTAL en kWh del periodo facturado. Busca "energía activa", "consumo total", "kWh facturados" o la SUMA de consumos por tramo horario.
- "total_factura": importe TOTAL a pagar (IVA incluido). Busca "total a pagar", "importe total", "total factura".
- "period_months": 1 para mensual, 2 para bimensual, 3 para trimestral. Calcula a partir de las fechas si las tienes.
- "potencia_contratada_kw": potencia contratada en kW. Si hay varias (P1, P2, P3), pon la P1 aquí también.
- "precio_energia_kwh": precio medio del kWh (€/kWh). Si hay tramos, calcula la media o usa el general.
- "precio_p1_kwh", "precio_p2_kwh", "precio_p3_kwh": precios por tramo horario (€/kWh) si aparecen.
- "tipo_tarifa": tipo de tarifa (2.0TD doméstico, 3.0TD >15kW, etc.).
- "cups": código CUPS (empieza por ES seguido de 16 dígitos y 2 letras).
- "titular": nombre del titular del contrato.
- "direccion_suministro": dirección del punto de suministro. Busca "dirección de suministro", "punto de suministro", "dirección del contrato". Incluye calle, número, piso, CP y localidad si aparecen.
- "company_name": normaliza al nombre comercial conocido (Iberdrola, Endesa, Naturgy, Repsol, EDP, Total Energies, Plenitude, Holaluz, Octopus, Cepsa, Viesgo, Fenie Energía, Gaba Energía, Contigo Energía, etc.)
- Si la factura es de GAS: extrae los mismos campos adaptados.
- Si NO es de energía: devuelve todos los campos como null.`;

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

/**
 * Calcula un score de confianza real basado en cuántos campos clave se extrajeron.
 */
function computeConfidence(e: InvoiceExtraction): number {
  const fields: [boolean, number][] = [
    [e.consumption_kwh != null && e.consumption_kwh > 0, 0.25],
    [e.total_factura != null && e.total_factura > 0, 0.25],
    [e.company_name != null, 0.10],
    [e.titular != null, 0.10],
    [e.cups != null, 0.10],
    [e.potencia_contratada_kw != null || e.potencia_p1_kw != null, 0.10],
    [e.tipo_tarifa != null, 0.05],
    [e.direccion_suministro != null, 0.05],
  ];
  return fields.reduce((sum, [ok, weight]) => sum + (ok ? weight : 0), 0);
}

/**
 * Extrae datos de una factura energética.
 * Usa GPT-4o-mini primero (rápido/barato). Si la confianza es < 0.7, reintenta con GPT-4o.
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

  const fast = await callResponsesAPI(fileBuffer, mimeType, MODEL_FAST, apiKey);
  const fastConfidence = computeConfidence(fast);
  fast.confidence = fastConfidence;

  if (fastConfidence >= CONFIDENCE_THRESHOLD) {
    console.log(`[llm-extract] gpt-4o-mini OK (confidence: ${fastConfidence.toFixed(2)})`);
    return fast;
  }

  console.log(`[llm-extract] gpt-4o-mini low confidence (${fastConfidence.toFixed(2)}), retrying with gpt-4o...`);
  const full = await callResponsesAPI(fileBuffer, mimeType, MODEL_FULL, apiKey);
  full.confidence = computeConfidence(full);
  console.log(`[llm-extract] gpt-4o confidence: ${full.confidence.toFixed(2)}`);
  return full;
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
    precio_energia_kwh: safePositiveNumber(parsed.precio_energia_kwh),
    precio_p1_kwh: safePositiveNumber(parsed.precio_p1_kwh),
    precio_p2_kwh: safePositiveNumber(parsed.precio_p2_kwh),
    precio_p3_kwh: safePositiveNumber(parsed.precio_p3_kwh),
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
