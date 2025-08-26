-- Create renewal_reminders table
CREATE TABLE public.renewal_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  reminder_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.renewal_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only admins can manage reminders
CREATE POLICY "Admins can manage renewal reminders" 
ON public.renewal_reminders 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_renewal_reminders_updated_at
BEFORE UPDATE ON public.renewal_reminders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_renewal_reminders_client_id ON public.renewal_reminders(client_id);
CREATE INDEX idx_renewal_reminders_reminder_date ON public.renewal_reminders(reminder_date);
CREATE INDEX idx_renewal_reminders_status ON public.renewal_reminders(status);