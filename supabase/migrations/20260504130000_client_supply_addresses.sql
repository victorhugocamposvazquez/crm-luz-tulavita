-- Puntos de suministro del cliente (distintos de la dirección fiscal/contacto en clients).

CREATE TABLE public.client_supply_addresses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT,
  direccion TEXT NOT NULL,
  localidad TEXT,
  codigo_postal TEXT,
  cups TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_supply_addresses_client_id ON public.client_supply_addresses(client_id);

COMMENT ON TABLE public.client_supply_addresses IS 'Direcciones / CUPS de suministro asociados al cliente (varios por cliente).';

CREATE TRIGGER update_client_supply_addresses_updated_at
  BEFORE UPDATE ON public.client_supply_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.client_supply_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commercials and admins can view client supply addresses"
  ON public.client_supply_addresses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

CREATE POLICY "Commercials and admins can insert client supply addresses"
  ON public.client_supply_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

CREATE POLICY "Commercials and admins can update client supply addresses"
  ON public.client_supply_addresses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

CREATE POLICY "Commercials and admins can delete client supply addresses"
  ON public.client_supply_addresses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );
