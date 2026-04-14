-- Zona de colaboradores para captación de leads de luz.
-- Permite:
-- 1) gestionar colaboradores desde CRM (admin),
-- 2) resolver colaboradores activos desde landing pública vía código.

CREATE TABLE public.collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collaborators_code ON public.collaborators (code);
CREATE INDEX idx_collaborators_active ON public.collaborators (is_active);

CREATE TRIGGER update_collaborators_updated_at
  BEFORE UPDATE ON public.collaborators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage collaborators"
  ON public.collaborators
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can read active collaborators"
  ON public.collaborators
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

GRANT ALL ON public.collaborators TO service_role;
