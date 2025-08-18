-- Add permission field to visits table
ALTER TABLE public.visits 
ADD COLUMN permission text DEFAULT 'pending' CHECK (permission IN ('pending', 'approved', 'rejected'));

-- Update existing visits to have 'approved' permission for simplicity
UPDATE public.visits SET permission = 'approved' WHERE permission IS NULL;