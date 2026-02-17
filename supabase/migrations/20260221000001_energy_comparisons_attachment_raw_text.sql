-- Guardar facturas fallidas para poder descargarlas y usarlas en el extractor (fixtures/patrones).
-- attachment_path: ruta en bucket lead-attachments para recuperar el archivo.
-- raw_text: texto extraído (Document AI/OCR) para usar en fixtures sin reprocesar.

ALTER TABLE public.energy_comparisons
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS raw_text TEXT;

COMMENT ON COLUMN public.energy_comparisons.attachment_path IS 'Ruta del archivo en bucket lead-attachments (NULL si comparación manual).';
COMMENT ON COLUMN public.energy_comparisons.raw_text IS 'Texto extraído de la factura para uso en fixtures/patrones (limitado en inserción).';
