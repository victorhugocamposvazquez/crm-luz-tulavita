-- Fix RLS policy for sales - remove company constraint for commercials
DROP POLICY IF EXISTS "Commercials can create their own sales" ON public.sales;

CREATE POLICY "Commercials can create sales" ON public.sales
FOR INSERT WITH CHECK (
  commercial_id = auth.uid() AND 
  has_role(auth.uid(), 'commercial'::app_role)
);