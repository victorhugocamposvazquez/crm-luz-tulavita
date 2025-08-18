-- Drop the trigger that creates duplicate admin tasks for approval requests
DROP TRIGGER IF EXISTS create_admin_task_for_approval_request_trigger ON public.client_approval_requests;

-- Drop the function that creates admin tasks for approval requests
DROP FUNCTION IF EXISTS public.create_admin_task_for_approval_request();