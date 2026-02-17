-- Añadir P1 y P2 a ofertas energéticas (términos de potencia para comparación)
ALTER TABLE public.energy_offers
  ADD COLUMN IF NOT EXISTS p1 NUMERIC(10, 6) CHECK (p1 IS NULL OR p1 >= 0),
  ADD COLUMN IF NOT EXISTS p2 NUMERIC(10, 6) CHECK (p2 IS NULL OR p2 >= 0);

COMMENT ON COLUMN public.energy_offers.p1 IS 'P1 (€/kW día o según unidad configurada)';
COMMENT ON COLUMN public.energy_offers.p2 IS 'P2 (€/kW día o según unidad configurada)';
COMMENT ON COLUMN public.energy_offers.price_per_kwh IS 'Precio consumo (€/kWh)';
