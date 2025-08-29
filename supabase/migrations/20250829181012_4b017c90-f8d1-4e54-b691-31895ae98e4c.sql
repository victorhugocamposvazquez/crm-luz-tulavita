-- Add locality and postal code fields to clients table
ALTER TABLE public.clients 
ADD COLUMN localidad text,
ADD COLUMN codigo_postal text;