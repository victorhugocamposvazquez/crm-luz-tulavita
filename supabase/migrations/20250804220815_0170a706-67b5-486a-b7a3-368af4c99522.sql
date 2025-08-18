-- Drop the existing trigger first
DROP TRIGGER IF EXISTS create_admin_task_on_new_client ON public.clients;

-- Fix the function to properly set commercial_id when creating admin tasks
CREATE OR REPLACE FUNCTION public.create_admin_task_for_new_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  commercial_user_id uuid;
BEGIN
  -- Get the commercial_id from the sales table if available, otherwise use the current user
  SELECT COALESCE(
    (SELECT commercial_id FROM sales WHERE client_id = NEW.id LIMIT 1),
    auth.uid()
  ) INTO commercial_user_id;
  
  INSERT INTO public.admin_tasks (type, title, description, client_id, commercial_id)
  VALUES (
    'new_client',
    'Nuevo cliente creado',
    'Un comercial ha registrado un nuevo cliente: ' || NEW.nombre_apellidos,
    NEW.id,
    commercial_user_id
  );
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER create_admin_task_on_new_client
    AFTER INSERT ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.create_admin_task_for_new_client();

-- Update the existing admin task to have a commercial_id
UPDATE public.admin_tasks 
SET commercial_id = auth.uid()
WHERE commercial_id IS NULL;

-- Simplify RLS policies for admin_tasks - admins can do everything
DROP POLICY IF EXISTS "Admins can manage all admin tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Admins can view all admin tasks" ON public.admin_tasks;

CREATE POLICY "Admins can manage all admin tasks" 
ON public.admin_tasks 
FOR ALL 
TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Simplify RLS policies for client_approval_requests - admins can do everything
DROP POLICY IF EXISTS "Admins can manage all approval requests" ON public.client_approval_requests;
DROP POLICY IF EXISTS "Admins can view all approval requests" ON public.client_approval_requests;

CREATE POLICY "Admins can manage all approval requests" 
ON public.client_approval_requests 
FOR ALL 
TO authenticated 
USING (has_role(auth.uid(), 'admin'::app_role));