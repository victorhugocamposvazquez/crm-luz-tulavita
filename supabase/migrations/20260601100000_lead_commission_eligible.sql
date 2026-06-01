-- Estado de comisión explícito para clientes captados por colaboradores.
-- Separa "venta cerrada / comisionable" del status del pipeline (que antes
-- reutilizaba 'converted' con doble significado). Esta columna es la única
-- fuente de verdad para generar liquidaciones de comisión.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS commission_eligible_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.commission_eligible_at IS
  'Marca de venta cerrada/comisionable de un cliente captado por colaborador. NULL = aún no comisionable. Fuente de verdad para generar liquidaciones.';

CREATE INDEX IF NOT EXISTS idx_leads_commission_eligible_at
  ON public.leads(commission_eligible_at)
  WHERE commission_eligible_at IS NOT NULL;

-- Backfill: los clientes captados ya marcados como 'converted' pasan a comisionables
-- para no perder el histórico de comisiones existente.
UPDATE public.leads
  SET commission_eligible_at = COALESCE(updated_at, created_at)
  WHERE collaborator_id IS NOT NULL
    AND source = 'collaborator_referral'
    AND status = 'converted'
    AND commission_eligible_at IS NULL;
