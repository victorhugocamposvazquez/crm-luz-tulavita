-- Fix RLS policies for visits table to resolve CORS/permission issues

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Admins can manage all visits" ON public.visits;
DROP POLICY IF EXISTS "Admins can view all visits" ON public.visits;
DROP POLICY IF EXISTS "Commercials can create visits" ON public.visits;
DROP POLICY IF EXISTS "Commercials can update their own visits" ON public.visits;
DROP POLICY IF EXISTS "Commercials can view all visits" ON public.visits;

-- Create clean, non-conflicting policies
CREATE POLICY "visits_select_policy" ON public.visits
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);

CREATE POLICY "visits_insert_policy" ON public.visits
FOR INSERT 
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  ) 
  AND commercial_id = auth.uid()
);

CREATE POLICY "visits_update_policy" ON public.visits
FOR UPDATE 
TO authenticated
USING (
  commercial_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin'
  )
)
WITH CHECK (
  commercial_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin'
  )
);

CREATE POLICY "visits_delete_policy" ON public.visits
FOR DELETE 
TO authenticated
USING (
  commercial_id = auth.uid() 
  OR EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin'
  )
);