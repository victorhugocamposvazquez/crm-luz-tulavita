-- Allow commercials to create approval requests
CREATE POLICY "Commercials can create approval requests" ON public.client_approval_requests
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  ) AND commercial_id = auth.uid()
);