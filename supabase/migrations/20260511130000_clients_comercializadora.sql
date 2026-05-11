-- Comercializadora de electricidad del cliente (nombre según censo CNMC u opción equivalente en UI).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS comercializadora text;

COMMENT ON COLUMN public.clients.comercializadora IS 'Comercializadora de electricidad (texto libre alineado con listado CNMC / selector en aplicación). NULL si no consta.';

CREATE INDEX IF NOT EXISTS idx_clients_comercializadora ON public.clients(comercializadora)
  WHERE comercializadora IS NOT NULL;
