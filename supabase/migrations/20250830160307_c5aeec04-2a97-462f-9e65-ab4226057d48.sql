-- Create the sale_lines_products table
CREATE TABLE public.sale_lines_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_line_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraint
ALTER TABLE public.sale_lines_products 
ADD CONSTRAINT fk_sale_lines_products_sale_line_id 
FOREIGN KEY (sale_line_id) REFERENCES public.sale_lines(id) ON DELETE CASCADE;

-- Migrate existing data from sale_lines to sale_lines_products
INSERT INTO public.sale_lines_products (sale_line_id, product_name)
SELECT id, product_name 
FROM public.sale_lines 
WHERE product_name IS NOT NULL;

-- Remove the product_name column from sale_lines
ALTER TABLE public.sale_lines DROP COLUMN product_name;

-- Enable RLS on sale_lines_products
ALTER TABLE public.sale_lines_products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for sale_lines_products
CREATE POLICY "Admins can manage all sale line products" 
ON public.sale_lines_products 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can view all sale line products" 
ON public.sale_lines_products 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = auth.uid() 
  AND ur.role = ANY (ARRAY['admin'::app_role, 'commercial'::app_role])
));

CREATE POLICY "Commercials can create sale line products for their sales" 
ON public.sale_lines_products 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM sales s 
  JOIN sale_lines sl ON s.id = sl.sale_id 
  WHERE sl.id = sale_lines_products.sale_line_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Commercials can update their own sale line products" 
ON public.sale_lines_products 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM sales s 
  JOIN sale_lines sl ON s.id = sl.sale_id 
  WHERE sl.id = sale_lines_products.sale_line_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Commercials can delete their own sale line products" 
ON public.sale_lines_products 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM sales s 
  JOIN sale_lines sl ON s.id = sl.sale_id 
  WHERE sl.id = sale_lines_products.sale_line_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

-- Create trigger for updated_at
CREATE TRIGGER update_sale_lines_products_updated_at
BEFORE UPDATE ON public.sale_lines_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();