-- Add latitude and longitude to clients table
ALTER TABLE public.clients 
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC;