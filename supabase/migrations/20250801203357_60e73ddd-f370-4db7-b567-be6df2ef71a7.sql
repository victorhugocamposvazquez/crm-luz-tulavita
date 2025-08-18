-- Alternative approach: Create new simpler policies without using role enum
DROP POLICY IF EXISTS "Only admins can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view all clients" ON public.clients;

-- Create policy for admin management
CREATE POLICY "admins_can_manage_clients" 
ON public.clients 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role::text = 'admin'
  )
);

-- Create policy for viewing (admin and commercial)
CREATE POLICY "users_can_view_clients" 
ON public.clients 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role::text IN ('admin', 'commercial')
  )
);