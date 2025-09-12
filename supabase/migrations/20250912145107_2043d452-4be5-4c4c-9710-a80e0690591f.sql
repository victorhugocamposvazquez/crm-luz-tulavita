-- Add second commercial field to visits table
ALTER TABLE public.visits 
ADD COLUMN second_commercial_id uuid REFERENCES auth.users(id);