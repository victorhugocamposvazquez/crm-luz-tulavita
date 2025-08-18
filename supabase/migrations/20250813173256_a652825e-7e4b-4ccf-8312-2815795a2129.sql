-- Fix RLS policy for sales to allow commercials to create sales for their company
DROP POLICY IF EXISTS "Commercials can create their own sales" ON public.sales;

CREATE POLICY "Commercials can create their own sales" ON public.sales
FOR INSERT WITH CHECK (
  (commercial_id = auth.uid()) AND 
  (
    has_role(auth.uid(), 'admin'::app_role) OR 
    (company_id = get_user_company(auth.uid()) OR company_id IS NULL)
  )
);