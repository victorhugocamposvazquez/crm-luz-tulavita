-- Enable realtime for visits table
ALTER TABLE public.visits REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visits;