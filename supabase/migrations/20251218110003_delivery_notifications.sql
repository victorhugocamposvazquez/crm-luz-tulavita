CREATE TABLE IF NOT EXISTS public.delivery_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_id UUID NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_delivery_notifications_user_id ON public.delivery_notifications(user_id);
CREATE INDEX idx_delivery_notifications_created_at ON public.delivery_notifications(created_at);

ALTER TABLE public.delivery_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
ON public.delivery_notifications
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
ON public.delivery_notifications
FOR DELETE
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE delivery_notifications;

CREATE OR REPLACE FUNCTION notify_delivery_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.delivery_id IS DISTINCT FROM NEW.delivery_id THEN
    INSERT INTO public.delivery_notifications (user_id, delivery_id, action)
    VALUES (OLD.delivery_id, OLD.id, 'removed');
    
    INSERT INTO public.delivery_notifications (user_id, delivery_id, action)
    VALUES (NEW.delivery_id, NEW.id, 'assigned');
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.delivery_notifications (user_id, delivery_id, action)
    VALUES (OLD.delivery_id, OLD.id, 'deleted');
  END IF;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.delivery_notifications (user_id, delivery_id, action)
    VALUES (NEW.delivery_id, NEW.id, 'assigned');
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER delivery_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.deliveries
FOR EACH ROW
EXECUTE FUNCTION notify_delivery_change();

GRANT ALL ON public.delivery_notifications TO authenticated;
GRANT ALL ON public.delivery_notifications TO service_role;
