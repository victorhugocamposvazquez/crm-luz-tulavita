/**
 * Tipos para extracción y procesamiento de facturas
 */

export interface InvoiceExtraction {
  company_name: string | null;
  consumption_kwh: number | null;
  total_factura: number | null;
  period_start: string | null;
  period_end: string | null;
  period_months: number;
  confidence: number;
  raw_text?: string;
}

export interface ProcessInvoiceInput {
  lead_id: string;
  /** Ruta en bucket lead-attachments, ej: "uuid/factura.pdf" */
  attachment_path: string;
  /** MIME tipo del archivo */
  mime_type: string;
}

export type ComparisonStatus = 'processing' | 'completed' | 'failed';
