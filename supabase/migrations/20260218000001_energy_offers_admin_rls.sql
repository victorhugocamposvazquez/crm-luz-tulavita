-- Permitir a admins gestionar ofertas energéticas desde el backoffice
CREATE POLICY "Admin full access energy_offers"
  ON public.energy_offers FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
