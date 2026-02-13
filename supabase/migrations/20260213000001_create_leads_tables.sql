-- ============================================
-- SISTEMA DE GESTIÓN DE LEADS
-- ============================================
-- Tablas: leads, lead_events, lead_imports
-- Diseño: normalizado, indexado, preparado para RLS
-- ============================================

-- Tabla principal de leads
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  campaign TEXT,
  adset TEXT,
  ad TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para búsqueda y deduplicación
CREATE INDEX idx_leads_phone ON public.leads(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_leads_email ON public.leads(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_owner_id ON public.leads(owner_id);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX idx_leads_tags ON public.leads USING GIN(tags);

-- Trigger updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabla de eventos (auditoría y automatizaciones)
CREATE TABLE public.lead_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_events_lead_id ON public.lead_events(lead_id);
CREATE INDEX idx_lead_events_type ON public.lead_events(type);
CREATE INDEX idx_lead_events_created_at ON public.lead_events(created_at DESC);

-- Tabla de importaciones (auditoría de fuentes externas)
CREATE TABLE public.lead_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  raw_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'partial', 'error')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_imports_source ON public.lead_imports(source);
CREATE INDEX idx_lead_imports_created_at ON public.lead_imports(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
-- Admins: acceso total
-- Comerciales: solo sus leads (owner_id = auth.uid())
-- ============================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_imports ENABLE ROW LEVEL SECURITY;

-- Leads: admins ven todo, comerciales solo los asignados
CREATE POLICY "Admins can manage all leads"
  ON public.leads FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view and update their own leads"
  ON public.leads FOR ALL
  USING (owner_id = auth.uid());

-- Lead events: mismo criterio que leads
CREATE POLICY "Admins can manage all lead_events"
  ON public.lead_events FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_events.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert lead_events for their leads"
  ON public.lead_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_events.lead_id
      AND (has_role(auth.uid(), 'admin'::app_role) OR l.owner_id = auth.uid())
    )
  );

-- Lead imports: solo admins (datos sensibles)
CREATE POLICY "Admins can manage lead_imports"
  ON public.lead_imports FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Permisos para service_role (Edge Functions, backend)
GRANT ALL ON public.leads TO service_role;
GRANT ALL ON public.lead_events TO service_role;
GRANT ALL ON public.lead_imports TO service_role;

-- Extender admin_tasks para tareas de leads (opcional)
ALTER TABLE public.admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_type_check;
ALTER TABLE public.admin_tasks ADD CONSTRAINT admin_tasks_type_check
  CHECK (type IN ('new_client', 'approval_request', 'lead_contact'));
