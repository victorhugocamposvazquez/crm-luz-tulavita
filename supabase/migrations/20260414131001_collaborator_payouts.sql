-- Liquidaciones de colaboradores (MVP).
-- Evita pagar dos veces el mismo lead convertido.

CREATE TABLE IF NOT EXISTS public.collaborator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  period_from DATE,
  period_to DATE,
  leads_count INTEGER NOT NULL DEFAULT 0 CHECK (leads_count >= 0),
  amount_total_eur NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_total_eur >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_payouts_collaborator_id_created_at
  ON public.collaborator_payouts(collaborator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaborator_payouts_status
  ON public.collaborator_payouts(status);

CREATE TABLE IF NOT EXISTS public.collaborator_payout_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.collaborator_payouts(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  amount_eur NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_eur >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS idx_collaborator_payout_leads_payout_id
  ON public.collaborator_payout_leads(payout_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_payout_leads_collaborator_id
  ON public.collaborator_payout_leads(collaborator_id);

ALTER TABLE public.collaborator_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborator_payout_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage collaborator_payouts" ON public.collaborator_payouts;
CREATE POLICY "Admins can manage collaborator_payouts"
  ON public.collaborator_payouts
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage collaborator_payout_leads" ON public.collaborator_payout_leads;
CREATE POLICY "Admins can manage collaborator_payout_leads"
  ON public.collaborator_payout_leads
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

GRANT ALL ON public.collaborator_payouts TO service_role;
GRANT ALL ON public.collaborator_payout_leads TO service_role;
