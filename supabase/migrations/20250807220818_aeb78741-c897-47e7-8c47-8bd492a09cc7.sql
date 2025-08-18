-- Fix RLS policies for clients table to allow commercials to create clients
DROP POLICY IF EXISTS "Commercials can insert their own clients" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage all clients" ON public.clients;
DROP POLICY IF EXISTS "Commercials can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Commercials can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Commercials can delete their own clients" ON public.clients;

-- Create new RLS policies for clients table
-- Allow commercials to create clients (any commercial can create any client)
CREATE POLICY "Commercials can create clients" 
ON public.clients 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('commercial', 'admin')
  )
);

-- Allow commercials to view all clients
CREATE POLICY "Commercials can view all clients" 
ON public.clients 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('commercial', 'admin')
  )
);

-- Allow commercials to update clients
CREATE POLICY "Commercials can update clients" 
ON public.clients 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('commercial', 'admin')
  )
) 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('commercial', 'admin')
  )
);

-- Allow admins to delete clients
CREATE POLICY "Admins can delete clients" 
ON public.clients 
FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);