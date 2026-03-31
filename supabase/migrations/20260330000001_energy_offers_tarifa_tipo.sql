-- Añadir tipo de tarifa a ofertas energéticas (2.0TD / 3.0TD)
ALTER TABLE public.energy_offers
  ADD COLUMN IF NOT EXISTS tarifa_tipo TEXT NOT NULL DEFAULT '2.0TD'
  CHECK (tarifa_tipo IN ('2.0TD', '3.0TD'));

-- Añadir columnas P3-P6 para tarifas 3.0TD (potencia por periodo)
ALTER TABLE public.energy_offers
  ADD COLUMN IF NOT EXISTS p3 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS p4 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS p5 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS p6 NUMERIC(10,6);

-- Eliminar constraint UNIQUE solo en company_name (ahora puede haber misma empresa en 2.0 y 3.0)
ALTER TABLE public.energy_offers DROP CONSTRAINT IF EXISTS energy_offers_company_name_key;

-- Nuevo UNIQUE compuesto: empresa + tipo tarifa
ALTER TABLE public.energy_offers
  ADD CONSTRAINT energy_offers_company_tarifa_unique UNIQUE (company_name, tarifa_tipo);

-- Ofertas 3.0TD iniciales (Iberdrola y Naturgy) con 6 periodos de potencia
INSERT INTO public.energy_offers (company_name, price_per_kwh, monthly_fixed_cost, p1, p2, p3, p4, p5, p6, active, tarifa_tipo) VALUES
  ('Iberdrola', 0.1190, 0, 0.062012, 0.031155, 0.016070, 0.016070, 0.016070, 0.008535, true, '3.0TD'),
  ('Naturgy',   0.1114, 0, 0.059380, 0.029820, 0.015390, 0.015390, 0.015390, 0.008170, true, '3.0TD')
ON CONFLICT (company_name, tarifa_tipo) DO NOTHING;
