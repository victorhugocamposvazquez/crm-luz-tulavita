-- Add prospect column to clients table
ALTER TABLE public.clients 
ADD COLUMN prospect BOOLEAN NOT NULL DEFAULT false;

-- Drop existing unique constraint on DNI if it exists
-- and create a new one that allows NULL values
DROP INDEX IF EXISTS clients_dni_key;

-- Create partial unique index for DNI (excludes NULL values)
CREATE UNIQUE INDEX clients_dni_unique_idx ON public.clients (dni) WHERE dni IS NOT NULL;