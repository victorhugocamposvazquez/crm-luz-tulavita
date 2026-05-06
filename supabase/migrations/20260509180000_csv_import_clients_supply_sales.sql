-- Importación masiva (p. ej. VENTAS TULAVITA): trazabilidad en clients y suministro solo por CUPS.

ALTER TABLE public.client_supply_addresses
  ALTER COLUMN direccion DROP NOT NULL;

COMMENT ON COLUMN public.client_supply_addresses.direccion IS 'Dirección del punto de suministro; puede ser NULL si solo se conoce el CUPS (importación).';

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS import_source text,
  ADD COLUMN IF NOT EXISTS import_external_key text;

COMMENT ON COLUMN public.clients.import_batch_id IS 'UUID del lote de importación (misma ejecución de script).';
COMMENT ON COLUMN public.clients.import_source IS 'Origen del dato, p. ej. ventas_tulavita_csv.';
COMMENT ON COLUMN public.clients.import_external_key IS 'Clave estable para deduplicar cliente en re-importaciones (hash legible).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_import_external_key_unique
  ON public.clients (import_external_key)
  WHERE import_external_key IS NOT NULL;
