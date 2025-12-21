DROP POLICY IF EXISTS "visits_select_policy" ON public.visits;

CREATE POLICY "visits_select_policy" ON public.visits
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial', 'delivery')
  )
);
