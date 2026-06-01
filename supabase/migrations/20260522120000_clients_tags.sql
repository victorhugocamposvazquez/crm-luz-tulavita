-- Etiquetas de cliente (texto libre, p. ej. estados comerciales: KO, Liquidado, en trámite, Baja*).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.clients.tags IS 'Etiquetas del cliente (texto libre). Usadas p. ej. para estados comerciales importados (KO, Liquidado, en trámite, Baja Decomisionable/Decomisionada/No Decomisionable).';

CREATE INDEX IF NOT EXISTS idx_clients_tags_gin ON public.clients USING GIN (tags);
