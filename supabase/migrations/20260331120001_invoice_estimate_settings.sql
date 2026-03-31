-- Coeficientes para la columna «≈ Factura» del simulador (IE, IVA, cargos fijos €/día).
-- Una sola fila (id = 1); el backoffice admin la actualiza.

CREATE TABLE public.invoice_estimate_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  electricity_tax_rate NUMERIC(14, 12) NOT NULL,
  vat_rate NUMERIC(10, 8) NOT NULL,
  fixed_charges_eur_per_day NUMERIC(14, 8) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invoice_estimate_settings IS 'Coeficientes estimación factura simulador (impuesto eléctrico, IVA, cargos/día).';
COMMENT ON COLUMN public.invoice_estimate_settings.electricity_tax_rate IS 'Impuesto eléctrico como fracción (ej. 0.051126963).';
COMMENT ON COLUMN public.invoice_estimate_settings.vat_rate IS 'IVA como fracción (ej. 0.21).';
COMMENT ON COLUMN public.invoice_estimate_settings.fixed_charges_eur_per_day IS 'Cargos fijos orientativos €/día (alquiler contador + fin. bono, etc.).';

INSERT INTO public.invoice_estimate_settings (id, electricity_tax_rate, vat_rate, fixed_charges_eur_per_day)
VALUES (
  1,
  0.051126963,
  0.21,
  (6.54 / 31)::NUMERIC(14, 8)
);

ALTER TABLE public.invoice_estimate_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read invoice_estimate_settings"
  ON public.invoice_estimate_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin update invoice_estimate_settings"
  ON public.invoice_estimate_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No INSERT/DELETE desde cliente: solo la fila semilla vía migración.

CREATE TRIGGER update_invoice_estimate_settings_updated_at
  BEFORE UPDATE ON public.invoice_estimate_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT ON public.invoice_estimate_settings TO authenticated;
GRANT UPDATE ON public.invoice_estimate_settings TO authenticated;
