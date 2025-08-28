-- Add status field to clients table (default active)
ALTER TABLE public.clients 
ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- Add note field to clients table
ALTER TABLE public.clients 
ADD COLUMN note text;