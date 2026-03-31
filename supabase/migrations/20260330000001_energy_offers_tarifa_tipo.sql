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

-- Añadir columnas de precio por periodo (€/kWh) para tarifas 3.0TD
ALTER TABLE public.energy_offers
  ADD COLUMN IF NOT EXISTS price_p1 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS price_p2 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS price_p3 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS price_p4 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS price_p5 NUMERIC(10,6),
  ADD COLUMN IF NOT EXISTS price_p6 NUMERIC(10,6);

-- Eliminar constraint UNIQUE solo en company_name (ahora puede haber misma empresa en 2.0 y 3.0)
ALTER TABLE public.energy_offers DROP CONSTRAINT IF EXISTS energy_offers_company_name_key;

-- Nuevo UNIQUE compuesto: empresa + tipo tarifa (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'energy_offers_company_tarifa_unique'
  ) THEN
    ALTER TABLE public.energy_offers
      ADD CONSTRAINT energy_offers_company_tarifa_unique UNIQUE (company_name, tarifa_tipo);
  END IF;
END $$;

-- Ofertas 3.0TD iniciales (Iberdrola y Naturgy) con 6 periodos de potencia y precio
INSERT INTO public.energy_offers (
  company_name, price_per_kwh, monthly_fixed_cost,
  p1, p2, p3, p4, p5, p6,
  price_p1, price_p2, price_p3, price_p4, price_p5, price_p6,
  active, tarifa_tipo
) VALUES
  ('Iberdrola', 0.1500, 0,
    0.062012, 0.031155, 0.016070, 0.016070, 0.016070, 0.008535,
    0.183593, 0.158017, 0.134925, 0.121236, 0.114444, 0.106808,
    true, '3.0TD'),
  ('Naturgy', 0.1400, 0,
    0.059380, 0.029820, 0.015390, 0.015390, 0.015390, 0.008170,
    0.175000, 0.150000, 0.128000, 0.115000, 0.108000, 0.100000,
    true, '3.0TD')
ON CONFLICT (company_name, tarifa_tipo) DO UPDATE SET
  p1 = EXCLUDED.p1, p2 = EXCLUDED.p2, p3 = EXCLUDED.p3,
  p4 = EXCLUDED.p4, p5 = EXCLUDED.p5, p6 = EXCLUDED.p6,
  price_p1 = EXCLUDED.price_p1, price_p2 = EXCLUDED.price_p2, price_p3 = EXCLUDED.price_p3,
  price_p4 = EXCLUDED.price_p4, price_p5 = EXCLUDED.price_p5, price_p6 = EXCLUDED.price_p6;
