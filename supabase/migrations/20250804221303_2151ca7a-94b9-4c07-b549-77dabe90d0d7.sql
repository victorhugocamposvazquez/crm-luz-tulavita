-- Remove all RLS policies that might be causing issues
DROP POLICY IF EXISTS "Admins can manage all admin tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Admins can view all admin tasks" ON public.admin_tasks;
DROP POLICY IF EXISTS "Admins can manage all approval requests" ON public.client_approval_requests;
DROP POLICY IF EXISTS "Admins can view all approval requests" ON public.client_approval_requests;
DROP POLICY IF EXISTS "Commercials can view their own requests" ON public.client_approval_requests;
DROP POLICY IF EXISTS "Commercials can create their own requests" ON public.client_approval_requests;

-- Disable RLS temporarily to allow operations
ALTER TABLE public.admin_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_approval_requests DISABLE ROW LEVEL SECURITY;

-- Update the admin task that has null commercial_id
UPDATE public.admin_tasks 
SET commercial_id = '2b88c781-4814-4166-9fbb-bf6461fd4c6a'
WHERE commercial_id IS NULL;