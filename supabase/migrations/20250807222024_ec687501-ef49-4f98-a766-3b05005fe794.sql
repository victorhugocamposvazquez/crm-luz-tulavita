-- Enable realtime for client_approval_requests table
ALTER TABLE public.client_approval_requests REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE public.client_approval_requests;

-- Enable realtime for visits table
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE public.visits;