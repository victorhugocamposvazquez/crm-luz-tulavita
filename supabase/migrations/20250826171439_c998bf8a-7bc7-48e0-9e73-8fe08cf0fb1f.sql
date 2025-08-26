-- Update the visits insert policy to allow admins to create visits for any commercial
DROP POLICY IF EXISTS "visits_insert_policy" ON public.visits;

CREATE POLICY "visits_insert_policy" ON public.visits
FOR INSERT 
WITH CHECK (
  (EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = ANY (ARRAY['admin'::app_role, 'commercial'::app_role])
  )) 
  AND 
  (
    -- Admins can create visits for any commercial
    has_role(auth.uid(), 'admin'::app_role) 
    OR 
    -- Commercials can only create visits for themselves
    (has_role(auth.uid(), 'commercial'::app_role) AND commercial_id = auth.uid())
  )
);