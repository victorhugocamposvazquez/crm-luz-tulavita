-- Create table for sale product lines
CREATE TABLE public.sale_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED,
  paid_cash BOOLEAN NOT NULL DEFAULT false,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  is_delivered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sale_lines ENABLE ROW LEVEL SECURITY;

-- Create policies for sale lines
CREATE POLICY "Admins can view all sale lines" 
ON public.sale_lines 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can view their own sale lines" 
ON public.sale_lines 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND s.commercial_id = auth.uid()
));

CREATE POLICY "Commercials can create sale lines for their sales" 
ON public.sale_lines 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND s.commercial_id = auth.uid()
));

CREATE POLICY "Commercials can update their own sale lines" 
ON public.sale_lines 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND s.commercial_id = auth.uid()
));

CREATE POLICY "Commercials can delete their own sale lines" 
ON public.sale_lines 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND s.commercial_id = auth.uid()
));

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_sale_lines_updated_at
BEFORE UPDATE ON public.sale_lines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update sales table to remove visit_id and make commission fixed at 5%
ALTER TABLE public.sales DROP COLUMN IF EXISTS visit_id;
ALTER TABLE public.sales ALTER COLUMN commission_percentage SET DEFAULT 5;

-- Add function to calculate sale total from lines
CREATE OR REPLACE FUNCTION public.calculate_sale_total(sale_id_param UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(SUM(line_total), 0)
  FROM public.sale_lines
  WHERE sale_id = sale_id_param
$$;