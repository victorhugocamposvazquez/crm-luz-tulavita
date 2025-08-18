-- Fix RLS policies for clients table by recreating them with proper auth context

-- Drop existing policies
DROP POLICY IF EXISTS "Only admins can manage clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view all clients" ON public.clients;

-- Recreate policies with better auth context handling
CREATE POLICY "Only admins can manage clients" 
ON public.clients 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'::app_role
  )
);

CREATE POLICY "Authenticated users can view all clients" 
ON public.clients 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin'::app_role, 'commercial'::app_role)
  )
);