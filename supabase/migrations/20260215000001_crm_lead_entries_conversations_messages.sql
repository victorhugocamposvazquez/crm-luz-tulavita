-- ============================================
-- CRM OPERATIVO: entradas, conversaciones y mensajes
-- Sin modificar tabla leads existente
-- ============================================

-- Entradas por lead (cada envío de formulario / Lead Ad / origen)
CREATE TABLE public.lead_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual',
  campaign TEXT,
  adset TEXT,
  ad TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_entries_lead_id ON public.lead_entries(lead_id);
CREATE INDEX idx_lead_entries_source ON public.lead_entries(source);
CREATE INDEX idx_lead_entries_created_at ON public.lead_entries(created_at DESC);

-- Conversaciones por lead (canal: whatsapp, call, email)
CREATE TABLE public.lead_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'call', 'email')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_conversations_lead_id ON public.lead_conversations(lead_id);
CREATE INDEX idx_lead_conversations_channel ON public.lead_conversations(channel);
CREATE INDEX idx_lead_conversations_updated_at ON public.lead_conversations(updated_at DESC);

CREATE TRIGGER update_lead_conversations_updated_at
  BEFORE UPDATE ON public.lead_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mensajes dentro de una conversación
CREATE TABLE public.lead_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.lead_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_lead_messages_conversation_id ON public.lead_messages(conversation_id);
CREATE INDEX idx_lead_messages_created_at ON public.lead_messages(created_at DESC);

-- ============================================
-- RLS (mismo criterio que leads: admin todo, resto por owner)
-- ============================================

ALTER TABLE public.lead_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_messages ENABLE ROW LEVEL SECURITY;

-- lead_entries: ver/insertar si tienes acceso al lead
CREATE POLICY "Admins can manage all lead_entries"
  ON public.lead_entries FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage lead_entries for their leads"
  ON public.lead_entries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_entries.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_entries.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  );

-- lead_conversations
CREATE POLICY "Admins can manage all lead_conversations"
  ON public.lead_conversations FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage lead_conversations for their leads"
  ON public.lead_conversations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_conversations.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_conversations.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  );

-- lead_messages (vía conversación -> lead)
CREATE POLICY "Admins can manage all lead_messages"
  ON public.lead_messages FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage lead_messages for their leads"
  ON public.lead_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.lead_conversations lc
      JOIN public.leads l ON l.id = lc.lead_id
      WHERE lc.id = lead_messages.conversation_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lead_conversations lc
      JOIN public.leads l ON l.id = lc.lead_id
      WHERE lc.id = lead_messages.conversation_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  );

-- Service role para Edge Functions / API
GRANT ALL ON public.lead_entries TO service_role;
GRANT ALL ON public.lead_conversations TO service_role;
GRANT ALL ON public.lead_messages TO service_role;
