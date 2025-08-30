-- Clean up orphaned data first

-- Delete sale_lines_products that don't have a corresponding sale_line
DELETE FROM public.sale_lines_products 
WHERE sale_line_id NOT IN (SELECT id FROM public.sale_lines);

-- Delete sale_lines that don't have a corresponding sale
DELETE FROM public.sale_lines 
WHERE sale_id NOT IN (SELECT id FROM public.sales);

-- Delete sales that don't have a corresponding client
DELETE FROM public.sales 
WHERE client_id NOT IN (SELECT id FROM public.clients);

-- Add foreign key constraints with CASCADE if they don't exist
-- Check and add constraint for sales -> clients
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_sales_client_id' 
        AND table_name = 'sales' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sales 
        ADD CONSTRAINT fk_sales_client_id 
        FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Check and add constraint for sale_lines -> sales
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_sale_lines_sale_id' 
        AND table_name = 'sale_lines' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE public.sale_lines 
        ADD CONSTRAINT fk_sale_lines_sale_id 
        FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;
    END IF;
END $$;

-- The constraint for sale_lines_products already exists, but let's verify it has CASCADE
-- Drop and recreate if needed
ALTER TABLE public.sale_lines_products 
DROP CONSTRAINT IF EXISTS fk_sale_lines_products_sale_line_id;

ALTER TABLE public.sale_lines_products 
ADD CONSTRAINT fk_sale_lines_products_sale_line_id 
FOREIGN KEY (sale_line_id) REFERENCES public.sale_lines(id) ON DELETE CASCADE;