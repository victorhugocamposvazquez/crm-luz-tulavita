-- Fix the duplicate foreign key constraint issue
-- The error shows two relationships for sales->clients:
-- 1. "fk_sales_client_id" (our custom one)  
-- 2. "sales_client_id_fkey" (auto-generated duplicate)

-- Remove the duplicate auto-generated foreign key constraint
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_client_id_fkey;

-- Also clean up any other auto-generated duplicates that might exist
ALTER TABLE public.sale_lines DROP CONSTRAINT IF EXISTS sale_lines_sale_id_fkey;
ALTER TABLE public.sale_lines_products DROP CONSTRAINT IF EXISTS sale_lines_products_sale_line_id_fkey;