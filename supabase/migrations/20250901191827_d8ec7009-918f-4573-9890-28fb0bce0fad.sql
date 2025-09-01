-- Normalize existing client data and add unique constraint to DNI

-- First, normalize existing data
UPDATE public.clients 
SET 
  dni = CASE 
    WHEN dni IS NOT NULL THEN 
      UPPER(TRIM(dni))
    ELSE dni
  END,
  nombre_apellidos = UPPER(TRIM(nombre_apellidos))
WHERE dni IS NOT NULL OR nombre_apellidos IS NOT NULL;

-- Add unique constraint to DNI column (only for non-null values)
-- Using partial unique index for non-null, non-empty DNIs
ALTER TABLE public.clients 
ADD CONSTRAINT clients_dni_unique 
UNIQUE (dni) 
DEFERRABLE INITIALLY DEFERRED;