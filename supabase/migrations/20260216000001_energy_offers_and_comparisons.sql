-- ============================================
-- SISTEMA DE CÁLCULO DE AHORRO ENERGÉTICO
-- ============================================

-- Ofertas por comercializadora (configurables desde backoffice/API)
CREATE TABLE public.energy_offers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL UNIQUE,
  price_per_kwh NUMERIC(10, 6) NOT NULL CHECK (price_per_kwh >= 0),
  monthly_fixed_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (monthly_fixed_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_energy_offers_active ON public.energy_offers(active) WHERE active = true;

CREATE TRIGGER update_energy_offers_updated_at
  BEFORE UPDATE ON public.energy_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resultados de comparación por lead
CREATE TABLE public.energy_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_company TEXT,
  current_monthly_cost NUMERIC(10, 2),
  best_offer_company TEXT,
  estimated_savings_amount NUMERIC(10, 2),
  estimated_savings_percentage NUMERIC(5, 2),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  ocr_confidence NUMERIC(3, 2),
  invoice_period_months INTEGER DEFAULT 1,
  prudent_mode BOOLEAN DEFAULT false,
  raw_extraction JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_energy_comparisons_lead_id ON public.energy_comparisons(lead_id);
CREATE INDEX idx_energy_comparisons_status ON public.energy_comparisons(status);
CREATE INDEX idx_energy_comparisons_created_at ON public.energy_comparisons(lead_id, created_at DESC);

-- RLS
ALTER TABLE public.energy_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_comparisons ENABLE ROW LEVEL SECURITY;

-- Ofertas: lectura para todos autenticados; escritura solo admin (o service_role desde API)
CREATE POLICY "Allow read energy_offers"
  ON public.energy_offers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role full access energy_offers"
  ON public.energy_offers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Comparaciones: usuario ve las de sus leads; service_role para API
CREATE POLICY "Users can view comparisons for their leads"
  ON public.energy_comparisons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = energy_comparisons.lead_id
      AND (l.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Service role full access energy_comparisons"
  ON public.energy_comparisons FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.energy_offers TO service_role;
GRANT ALL ON public.energy_comparisons TO service_role;

-- Seed: 4 comercializadoras con precios de ejemplo (se actualizan desde backoffice)
INSERT INTO public.energy_offers (company_name, price_per_kwh, monthly_fixed_cost, active) VALUES
  ('Iberdrola',    0.145, 5.50, true),
  ('Endesa',       0.142, 4.90, true),
  ('Naturgy',      0.148, 5.00, true),
  ('Repsol',       0.140, 6.00, true)
ON CONFLICT (company_name) DO NOTHING;
