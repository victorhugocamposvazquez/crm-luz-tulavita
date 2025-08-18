
-- Drop the existing policies for clients
DROP POLICY IF EXISTS "Commercials can create clients in their company" ON public.clients;
DROP POLICY IF EXISTS "Commercials can view clients from their company" ON public.clients;
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Admins can manage clients" ON public.clients;

-- Remove the company_id column from clients table
ALTER TABLE public.clients DROP COLUMN IF EXISTS company_id;

-- Create new policies for clients
-- Only admins can create, update and delete clients
CREATE POLICY "Only admins can manage clients" 
  ON public.clients 
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Both admins and commercials can view all clients
CREATE POLICY "Authenticated users can view all clients" 
  ON public.clients 
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'commercial'::app_role)
  );
