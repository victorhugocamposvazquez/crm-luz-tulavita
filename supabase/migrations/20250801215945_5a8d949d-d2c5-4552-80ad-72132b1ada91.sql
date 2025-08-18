-- Hacer company_id nullable en la tabla visits
ALTER TABLE public.visits ALTER COLUMN company_id DROP NOT NULL;