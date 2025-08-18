-- Update sales policies to allow admins to create/manage sales
DROP POLICY IF EXISTS "Commercials can create their own sales" ON public.sales;
DROP POLICY IF EXISTS "Commercials can update their own sales" ON public.sales;

-- New sales policies
CREATE POLICY "Admins can manage all sales" 
ON public.sales 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can create their own sales" 
ON public.sales 
FOR INSERT 
WITH CHECK (
  commercial_id = auth.uid() AND 
  (has_role(auth.uid(), 'admin'::app_role) OR company_id = get_user_company(auth.uid()))
);

CREATE POLICY "Commercials can update their own sales" 
ON public.sales 
FOR UPDATE 
USING (
  commercial_id = auth.uid() OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update visits policies to allow admins to create/manage visits
DROP POLICY IF EXISTS "Commercials can create their own visits" ON public.visits;
DROP POLICY IF EXISTS "Commercials can update their own visits" ON public.visits;

-- New visits policies  
CREATE POLICY "Admins can manage all visits" 
ON public.visits 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can create their own visits" 
ON public.visits 
FOR INSERT 
WITH CHECK (
  commercial_id = auth.uid() AND 
  (has_role(auth.uid(), 'admin'::app_role) OR company_id = get_user_company(auth.uid()))
);

CREATE POLICY "Commercials can update their own visits" 
ON public.visits 
FOR UPDATE 
USING (
  commercial_id = auth.uid() OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update sale_lines policies to allow admins
DROP POLICY IF EXISTS "Commercials can create sale lines for their sales" ON public.sale_lines;
DROP POLICY IF EXISTS "Commercials can update their own sale lines" ON public.sale_lines;
DROP POLICY IF EXISTS "Commercials can delete their own sale lines" ON public.sale_lines;

-- New sale_lines policies
CREATE POLICY "Admins can manage all sale lines" 
ON public.sale_lines 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can create sale lines for their sales" 
ON public.sale_lines 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Commercials can update their own sale lines" 
ON public.sale_lines 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));

CREATE POLICY "Commercials can delete their own sale lines" 
ON public.sale_lines 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM public.sales s 
  WHERE s.id = sale_lines.sale_id 
  AND (s.commercial_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
));