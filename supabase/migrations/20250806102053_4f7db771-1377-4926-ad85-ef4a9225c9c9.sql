-- Drop and recreate visit creation policy to be more permissive
DROP POLICY IF EXISTS "Commercials can create their own visits" ON public.visits;

CREATE POLICY "Commercials can create visits" ON public.visits
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  ) AND commercial_id = auth.uid()
);