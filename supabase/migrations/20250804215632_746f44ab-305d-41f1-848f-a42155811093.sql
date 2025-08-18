-- Create admin_tasks table for general administrative notifications
CREATE TABLE public.admin_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('new_client', 'approval_request')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  commercial_id UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create client_approval_requests table for client access requests
CREATE TABLE public.client_approval_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  commercial_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_approval_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_tasks
CREATE POLICY "Admins can view all admin tasks"
ON public.admin_tasks
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage all admin tasks"
ON public.admin_tasks
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for client_approval_requests
CREATE POLICY "Admins can view all approval requests"
ON public.client_approval_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Commercials can view their own requests"
ON public.client_approval_requests
FOR SELECT
USING (commercial_id = auth.uid());

CREATE POLICY "Commercials can create their own requests"
ON public.client_approval_requests
FOR INSERT
WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "Admins can manage all approval requests"
ON public.client_approval_requests
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add triggers for updated_at
CREATE TRIGGER update_admin_tasks_updated_at
BEFORE UPDATE ON public.admin_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_approval_requests_updated_at
BEFORE UPDATE ON public.client_approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create admin task when new client is created
CREATE OR REPLACE FUNCTION public.create_admin_task_for_new_client()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_tasks (type, title, description, client_id)
  VALUES (
    'new_client',
    'Nuevo cliente creado',
    'Un comercial ha registrado un nuevo cliente: ' || NEW.nombre_apellidos,
    NEW.id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create admin task when approval request is created
CREATE OR REPLACE FUNCTION public.create_admin_task_for_approval_request()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.admin_tasks (type, title, description, client_id, commercial_id)
  VALUES (
    'approval_request',
    'Solicitud de acceso a cliente',
    'Un comercial solicita acceso para ver información del cliente',
    NEW.client_id,
    NEW.commercial_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Triggers to automatically create admin tasks
CREATE TRIGGER create_admin_task_on_new_client
AFTER INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.create_admin_task_for_new_client();

CREATE TRIGGER create_admin_task_on_approval_request
AFTER INSERT ON public.client_approval_requests
FOR EACH ROW
EXECUTE FUNCTION public.create_admin_task_for_approval_request();

-- Enable realtime for these tables
ALTER TABLE public.admin_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.client_approval_requests REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_approval_requests;