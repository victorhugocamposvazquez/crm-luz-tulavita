-- Base de comisiones por colaborador (MVP):
-- comisión fija por lead convertido.

ALTER TABLE public.collaborators
  ADD COLUMN IF NOT EXISTS commission_per_converted_eur NUMERIC(10,2) NOT NULL DEFAULT 30.00;

COMMENT ON COLUMN public.collaborators.commission_per_converted_eur IS
  'Comisión fija en euros por lead convertido atribuido al colaborador.';
