-- Añadir tipo de tarifa a ofertas energéticas (2.0TD / 3.0TD)
ALTER TABLE public.energy_offers
  ADD COLUMN IF NOT EXISTS tarifa_tipo TEXT NOT NULL DEFAULT '2.0TD'
  CHECK (tarifa_tipo IN ('2.0TD', '3.0TD'));

-- Eliminar constraint UNIQUE solo en company_name (ahora puede haber misma empresa en 2.0 y 3.0)
ALTER TABLE public.energy_offers DROP CONSTRAINT IF EXISTS energy_offers_company_name_key;

-- Nuevo UNIQUE compuesto: empresa + tipo tarifa
ALTER TABLE public.energy_offers
  ADD CONSTRAINT energy_offers_company_tarifa_unique UNIQUE (company_name, tarifa_tipo);

-- Ofertas 3.0TD iniciales (Iberdrola y Naturgy)
INSERT INTO public.energy_offers (company_name, price_per_kwh, monthly_fixed_cost, p1, p2, active, tarifa_tipo) VALUES
  ('Iberdrola', 0.1190, 0, 0.119100, 0.050600, true, '3.0TD'),
  ('Naturgy',   0.1114, 0, 0.122000, 0.043900, true, '3.0TD')
ON CONFLICT (company_name, tarifa_tipo) DO NOTHING;
