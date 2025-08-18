-- Update RLS policies for sales to use visit_id when appropriate
-- First, let's make sure sales can be properly created with visit_id

-- Update the policy to allow creation with visit_id
DROP POLICY IF EXISTS "Commercials can create their own sales" ON public.sales;

CREATE POLICY "Commercials can create their own sales" 
ON public.sales 
FOR INSERT 
WITH CHECK (
  (commercial_id = auth.uid()) 
  AND (has_role(auth.uid(), 'admin'::app_role) OR (company_id = get_user_company(auth.uid())))
  AND (visit_id IS NULL OR EXISTS (
    SELECT 1 FROM public.visits v 
    WHERE v.id = visit_id 
    AND v.commercial_id = auth.uid()
  ))
);