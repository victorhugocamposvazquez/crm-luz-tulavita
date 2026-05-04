-- Comercial asignado al cliente (solo administradores pueden establecerlo o cambiarlo).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS assigned_commercial_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_assigned_commercial_id ON public.clients(assigned_commercial_id);

COMMENT ON COLUMN public.clients.assigned_commercial_id IS 'Perfil del comercial responsable; editable solo por admins (trigger).';

CREATE OR REPLACE FUNCTION public.clients_assigned_commercial_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      NEW.assigned_commercial_id := NULL;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      NEW.assigned_commercial_id := OLD.assigned_commercial_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_assigned_commercial_guard ON public.clients;
CREATE TRIGGER trg_clients_assigned_commercial_guard
BEFORE INSERT OR UPDATE ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.clients_assigned_commercial_guard();
