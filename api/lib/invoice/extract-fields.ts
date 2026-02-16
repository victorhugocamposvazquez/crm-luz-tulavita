/**
 * Extrae campos de factura a partir de texto plano (PDF o OCR).
 * Heurísticas y regex para compañías españolas y formatos habituales.
 */

import type { InvoiceExtraction } from './types';

const COMPANY_PATTERNS = [
  /\b(iberdrola|endesa|naturgy|repsol|edp|total energies|viesgo|holaluz|luz en casa)\b/gi,
  /comercializador[ao]\s*[:\s]*([^\n\r,]+)/i,
  /empresa\s*[:\s]*([^\n\r,]+)/i,
];

const CONSUMPTION_PATTERNS = [
  /consumo\s*(?:total|de\s*energía|eléctrico)?\s*[:\s]*(\d+(?:[.,]\d+)?)\s*kwh/gi,
  /(\d+(?:[.,]\d+)?)\s*kwh\s*(?:consumo|total)/gi,
  /energía\s*activa\s*[:\s]*(\d+(?:[.,]\d+)?)/gi,
  /(\d+(?:[.,]\d+)?)\s*kwh/gi,
];

const TOTAL_PATTERNS = [
  /total\s*(?:a\s*)?pagar\s*[:\s]*(\d+(?:[.,]\d+)?)\s*€?/gi,
  /importe\s*total\s*[:\s]*(\d+(?:[.,]\d+)?)/gi,
  /(\d+(?:[.,]\d+)?)\s*€\s*\(?\s*total/gi,
  /total\s*[:\s]*(\d+(?:[.,]\d+)?)\s*eur/gi,
];

function parseDecimal(str: string): number {
  const normalized = str.trim().replace(',', '.');
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
}

function firstMatchNumber(text: string, patterns: RegExp[]): number | null {
  const s = firstMatch(text, patterns);
  if (s == null) return null;
  const n = parseDecimal(s);
  return n > 0 ? n : null;
}

/** Detecta periodo en meses por menciones "bimensual", "2 meses", fechas, etc. */
function detectPeriodMonths(text: string): number {
  const t = text.toLowerCase();
  if (/\b(bimensual|2\s*meses|dos\s*meses)\b/.test(t)) return 2;
  if (/\b(trimestral|3\s*meses)\b/.test(t)) return 3;
  return 1;
}

/** Normaliza nombre de compañía para comparar con energy_offers */
export function normalizeCompanyName(name: string | null): string | null {
  if (!name || !name.trim()) return null;
  const n = name.trim().toLowerCase();
  if (n.includes('iberdrola')) return 'Iberdrola';
  if (n.includes('endesa')) return 'Endesa';
  if (n.includes('naturgy') || n.includes('gas natural')) return 'Naturgy';
  if (n.includes('repsol')) return 'Repsol';
  return name.trim();
}

export function extractFieldsFromText(rawText: string): InvoiceExtraction {
  const text = rawText.replace(/\s+/g, ' ');
  let company_name: string | null = null;
  for (const re of COMPANY_PATTERNS) {
    const m = text.match(re);
    if (m) {
      company_name = (m[1] || m[0]).trim();
      break;
    }
  }
  const consumption_kwh = firstMatchNumber(text, CONSUMPTION_PATTERNS);
  const total_factura = firstMatchNumber(text, TOTAL_PATTERNS);
  const period_months = detectPeriodMonths(text);
  return {
    company_name: company_name ? normalizeCompanyName(company_name) : null,
    consumption_kwh,
    total_factura,
    period_start: null,
    period_end: null,
    period_months,
    confidence: 0.85,
    raw_text: rawText.slice(0, 2000),
  };
}
