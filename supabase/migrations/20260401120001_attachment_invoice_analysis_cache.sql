-- Caché de análisis de factura por ruta en storage (prefetch en landing mientras el usuario rellena el formulario).
-- process-invoice reutiliza la fila si sigue vigente para no repetir extracción/LLM.

CREATE TABLE IF NOT EXISTS public.attachment_invoice_analysis_cache (
  storage_path TEXT NOT NULL PRIMARY KEY,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachment_invoice_cache_expires
  ON public.attachment_invoice_analysis_cache (expires_at);

COMMENT ON TABLE public.attachment_invoice_analysis_cache IS
  'Resultado de extracción+comparación por attachment_path; TTL corto para acelerar preview y process-invoice.';

ALTER TABLE public.attachment_invoice_analysis_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access attachment_invoice_analysis_cache"
  ON public.attachment_invoice_analysis_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.attachment_invoice_analysis_cache TO service_role;
