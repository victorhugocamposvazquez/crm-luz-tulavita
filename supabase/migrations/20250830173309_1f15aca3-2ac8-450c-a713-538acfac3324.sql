-- First, let's clean up orphaned data before adding constraints

-- Delete sale_lines_products that don't have a corresponding sale_line
DELETE FROM public.sale_lines_products 
WHERE sale_line_id NOT IN (SELECT id FROM public.sale_lines);

-- Delete sale_lines that don't have a corresponding sale
DELETE FROM public.sale_lines 
WHERE sale_id NOT IN (SELECT id FROM public.sales);

-- Delete sales that don't have a corresponding client
DELETE FROM public.sales 
WHERE client_id NOT IN (SELECT id FROM public.clients);

-- Now add the foreign key constraints with CASCADE delete

-- Add foreign key from sales to clients with CASCADE
ALTER TABLE public.sales 
ADD CONSTRAINT fk_sales_client_id 
FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;

-- Add foreign key from sale_lines to sales with CASCADE  
ALTER TABLE public.sale_lines 
ADD CONSTRAINT fk_sale_lines_sale_id 
FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

-- Add foreign key from sale_lines_products to sale_lines with CASCADE
ALTER TABLE public.sale_lines_products 
ADD CONSTRAINT fk_sale_lines_products_sale_line_id 
FOREIGN KEY (sale_line_id) REFERENCES public.sale_lines(id) ON DELETE CASCADE;