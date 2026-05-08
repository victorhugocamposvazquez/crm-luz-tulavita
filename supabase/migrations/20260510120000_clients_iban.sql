-- IBAN del cliente (cuenta bancaria asociada).
--
-- Se almacena normalizado (mayúsculas, sin espacios). Permitimos NULL para clientes sin domiciliación
-- y aceptamos repeticiones (varios clientes pueden compartir cuenta familiar/empresarial).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS iban text;

COMMENT ON COLUMN public.clients.iban IS 'IBAN normalizado (sin espacios, mayúsculas). NULL si no consta. Validación de formato a nivel de aplicación.';

-- Índice trigram para búsquedas parciales (últimos 4 dígitos, etc.) sin penalizar inserts.
CREATE INDEX IF NOT EXISTS idx_clients_iban ON public.clients(iban) WHERE iban IS NOT NULL;
