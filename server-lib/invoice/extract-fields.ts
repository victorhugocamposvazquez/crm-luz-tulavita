/**
 * Extrae campos de factura a partir de texto plano (PDF o OCR).
 * Basado en estructura típica de facturas de luz/gas en España (ver docs/ESTRUCTURA-FACTURAS-ENERGIA-ESPAÑA.md).
 */

import type { InvoiceExtraction } from './types.js';

const COMPANY_PATTERNS = [
  /\b(iberdrola|endesa|naturgy|repsol|edp|total\s*energies?|viesgo|holaluz|luz\s*en\s*casa|octopus|plenitude|cepsa|factor\s*energía)\b/gi,
  /comercializador[ao]\s*[:\s]*([^\n\r,]+)/i,
  /(?:empresa|suministrador)\s*[:\s]*([^\n\r,]+)/i,
  /factura\s+(?:de\s+)?(?:luz|electricidad|gas)\s+[–-]\s*([^\n\r,]+)/i,
];

const CONSUMPTION_PATTERNS = [
  /consumo\s*(?:total|de\s*energía|eléctrico)?\s*[:\s]*(\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s*kwh/gi,
  /(?:término\s+de\s+)?energía\s*activa\s*[:\s]*(\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?)/gi,
  /(\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s*kwh\s*(?:consumo|total|facturado)?/gi,
  /consumo\s*[:\s]*(\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s*kwh/gi,
  /(\d+(?:[.,]\d+)?)\s*kwh(?!\s*[hH])/gi,
];

const TOTAL_PATTERNS = [
  /total\s*(?:a\s*)?pagar\s*[:\s]*(\d+(?:[.,]\d+)?)\s*€?/gi,
  /importe\s*total\s*(?:\(.*?\))?\s*[:\s]*(\d+(?:[.,]\d+)?)/gi,
  /total\s*(?:importe|factura)\s*[:\s]*(\d+(?:[.,]\d+)?)/gi,
  /(\d+(?:[.,]\d+)?)\s*€\s*\(?\s*total/gi,
  /total\s*[:\s]*(\d+(?:[.,]\d+)?)\s*eur/gi,
  /(?:iva\s+incluido|total)\s*[:\s]*(\d+(?:[.,]\d+)?)\s*€/gi,
];

/** Acepta "1.234,56" (europeo), "1 234,56", "1234.56", "1,234.56". */
function parseDecimal(str: string): number {
  let s = str.trim().replace(/\s/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
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

/** Detecta periodo en meses (facturación bimensual, trimestral, etc.). */
function detectPeriodMonths(text: string): number {
  const t = text.toLowerCase();
  if (/\b(bimensual|2\s*meses|dos\s*meses|facturación\s*bimensual)\b/.test(t)) return 2;
  if (/\b(trimestral|3\s*meses|tres\s*meses|facturación\s*trimestral)\b/.test(t)) return 3;
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
  if (n.includes('edp')) return 'EDP';
  if (n.includes('total energies')) return 'Total Energies';
  if (n.includes('holaluz')) return 'Holaluz';
  if (n.includes('octopus')) return 'Octopus';
  if (n.includes('plenitude')) return 'Plenitude';
  if (n.includes('cepsa')) return 'Cepsa';
  if (n.includes('viesgo')) return 'Viesgo';
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
