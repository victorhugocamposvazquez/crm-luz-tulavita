/**
 * Tipos para extracción y procesamiento de facturas energéticas españolas.
 * Campos extendidos: potencia contratada, CUPS, tipo de tarifa, precios por tramo.
 */

export interface InvoiceExtraction {
  company_name: string | null;
  consumption_kwh: number | null;
  total_factura: number | null;
  period_start: string | null;
  period_end: string | null;
  period_months: number;
  confidence: number;

  potencia_contratada_kw: number | null;
  potencia_p1_kw: number | null;
  potencia_p2_kw: number | null;
  potencia_p3_kw: number | null;
  potencia_p4_kw: number | null;
  potencia_p5_kw: number | null;
  potencia_p6_kw: number | null;

  precio_energia_kwh: number | null;
  precio_p1_kwh: number | null;
  precio_p2_kwh: number | null;
  precio_p3_kwh: number | null;
  precio_p4_kwh: number | null;
  precio_p5_kwh: number | null;
  precio_p6_kwh: number | null;

  tipo_tarifa: string | null;
  cups: string | null;
  titular: string | null;
  direccion_suministro: string | null;

  raw_text?: string;
}

export function emptyExtraction(): InvoiceExtraction {
  return {
    company_name: null,
    consumption_kwh: null,
    total_factura: null,
    period_start: null,
    period_end: null,
    period_months: 1,
    confidence: 0,
    potencia_contratada_kw: null,
    potencia_p1_kw: null,
    potencia_p2_kw: null,
    potencia_p3_kw: null,
    potencia_p4_kw: null,
    potencia_p5_kw: null,
    potencia_p6_kw: null,
    precio_energia_kwh: null,
    precio_p1_kwh: null,
    precio_p2_kwh: null,
    precio_p3_kwh: null,
    precio_p4_kwh: null,
    precio_p5_kwh: null,
    precio_p6_kwh: null,
    tipo_tarifa: null,
    cups: null,
    titular: null,
    direccion_suministro: null,
  };
}

export interface ProcessInvoiceInput {
  lead_id: string;
  attachment_path: string;
  mime_type: string;
}

export type ComparisonStatus = 'processing' | 'completed' | 'failed';
