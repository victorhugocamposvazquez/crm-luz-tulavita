-- Add visit_id column to sales table to link each sale to a specific visit
ALTER TABLE public.sales 
ADD COLUMN visit_id UUID;

-- Add foreign key constraint to ensure data integrity
ALTER TABLE public.sales 
ADD CONSTRAINT fk_sales_visit_id 
FOREIGN KEY (visit_id) REFERENCES public.visits(id) ON DELETE CASCADE;

-- Create index for better performance on visit_id queries
CREATE INDEX idx_sales_visit_id ON public.sales(visit_id);

-- Add unique constraint to ensure only one sale per visit
ALTER TABLE public.sales 
ADD CONSTRAINT unique_sale_per_visit 
UNIQUE (visit_id);