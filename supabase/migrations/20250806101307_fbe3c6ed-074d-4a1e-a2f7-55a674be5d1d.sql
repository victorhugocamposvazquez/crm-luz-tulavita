-- Drop restrictive RLS policies and create more permissive ones for development

-- Companies: Allow commercials to view all companies (needed for dropdown)
DROP POLICY IF EXISTS "Commercials can view their company" ON public.companies;
CREATE POLICY "Commercials can view all companies" ON public.companies
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);

-- Sales: Allow commercials to view all sales (needed for client history)
DROP POLICY IF EXISTS "Commercials can view their own sales" ON public.sales;
CREATE POLICY "Commercials can view all sales" ON public.sales
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);

-- Sale lines: Allow commercials to view all sale lines (needed for client history)
DROP POLICY IF EXISTS "Commercials can view their own sale lines" ON public.sale_lines;
CREATE POLICY "Commercials can view all sale lines" ON public.sale_lines
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);

-- Visits: Allow commercials to view all visits (needed for client history)
DROP POLICY IF EXISTS "Commercials can view their own visits" ON public.visits;
CREATE POLICY "Commercials can view all visits" ON public.visits
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);