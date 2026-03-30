CREATE TABLE public.invoice_simulations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  file_name TEXT,
  thumbnail_base64 TEXT,
  extraction JSONB NOT NULL,
  comparison_result JSONB,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access invoice_simulations"
  ON public.invoice_simulations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_invoice_simulations_updated_at
  BEFORE UPDATE ON public.invoice_simulations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
