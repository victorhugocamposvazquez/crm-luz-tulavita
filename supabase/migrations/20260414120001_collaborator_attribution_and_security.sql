-- Endurecer la atribución de colaboradores y añadir enlaces firmados.

-- 1) Atribución fuerte en leads y lead_entries
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL;

ALTER TABLE public.lead_entries
  ADD COLUMN IF NOT EXISTS collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_collaborator_id ON public.leads(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_lead_entries_collaborator_id ON public.lead_entries(collaborator_id);

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_collaborator_source_check;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_collaborator_source_check
  CHECK (collaborator_id IS NULL OR source = 'collaborator_referral');

ALTER TABLE public.lead_entries
  DROP CONSTRAINT IF EXISTS lead_entries_collaborator_source_check;
ALTER TABLE public.lead_entries
  ADD CONSTRAINT lead_entries_collaborator_source_check
  CHECK (collaborator_id IS NULL OR source = 'collaborator_referral');

-- 2) Evitar reescrituras de atribución por usuarios no-admin.
CREATE OR REPLACE FUNCTION public.prevent_collaborator_attribution_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.collaborator_id IS NOT NULL
     AND NEW.collaborator_id IS DISTINCT FROM OLD.collaborator_id
     AND auth.role() <> 'service_role'
     AND NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'collaborator_id no se puede modificar una vez asignado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_collaborator_attribution_rewrite ON public.leads;
CREATE TRIGGER trg_prevent_collaborator_attribution_rewrite
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.prevent_collaborator_attribution_rewrite();

-- 3) Enlaces firmados/expirables para colaboradores.
CREATE TABLE IF NOT EXISTS public.collaborator_referral_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 24),
  entry_mode TEXT NOT NULL DEFAULT 'auto' CHECK (entry_mode IN ('auto', 'upload', 'manual', 'callback')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_referral_links_token ON public.collaborator_referral_links(token);
CREATE INDEX IF NOT EXISTS idx_collaborator_referral_links_collaborator_id ON public.collaborator_referral_links(collaborator_id);

ALTER TABLE public.collaborator_referral_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage collaborator_referral_links" ON public.collaborator_referral_links;
CREATE POLICY "Admins can manage collaborator_referral_links"
  ON public.collaborator_referral_links
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public can read active collaborator_referral_links" ON public.collaborator_referral_links;
CREATE POLICY "Public can read active collaborator_referral_links"
  ON public.collaborator_referral_links
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

GRANT ALL ON public.collaborator_referral_links TO service_role;

-- 4) Rate limit para entradas públicas de colaborador.
CREATE TABLE IF NOT EXISTS public.collaborator_lead_rate_log (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_lead_rate_log_ip_created_at
  ON public.collaborator_lead_rate_log(ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaborator_lead_rate_log_collaborator_created_at
  ON public.collaborator_lead_rate_log(collaborator_id, created_at DESC);

ALTER TABLE public.collaborator_lead_rate_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access collaborator_lead_rate_log" ON public.collaborator_lead_rate_log;
CREATE POLICY "Service role full access collaborator_lead_rate_log"
  ON public.collaborator_lead_rate_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.collaborator_lead_rate_log TO service_role;
