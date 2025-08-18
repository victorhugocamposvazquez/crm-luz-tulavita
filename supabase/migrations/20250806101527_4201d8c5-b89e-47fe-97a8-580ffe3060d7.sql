-- Enable RLS on tables that need it
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_approval_requests ENABLE ROW LEVEL SECURITY;

-- Add basic policies for admin_tasks
CREATE POLICY "Admins can manage admin tasks" ON public.admin_tasks
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin'
  )
);

-- Add basic policies for client_approval_requests  
CREATE POLICY "Admins can manage approval requests" ON public.client_approval_requests
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin'
  )
);

CREATE POLICY "Commercials can view approval requests" ON public.client_approval_requests
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'commercial')
  )
);