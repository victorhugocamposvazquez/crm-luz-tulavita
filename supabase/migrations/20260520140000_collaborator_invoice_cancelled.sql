-- Permite anular facturas de comisión subidas por error desde el portal colaborador.

ALTER TABLE public.collaborator_invoices
  DROP CONSTRAINT IF EXISTS collaborator_invoices_status_check;

ALTER TABLE public.collaborator_invoices
  ADD CONSTRAINT collaborator_invoices_status_check
  CHECK (status IN ('submitted', 'approved', 'paid', 'rejected', 'cancelled'));
