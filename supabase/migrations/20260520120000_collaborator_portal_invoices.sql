-- Portal autoservicio colaborador, facturas de comisión y atribución referidor→reclutado.

-- 1) Referidor en leads de reclutamiento
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referred_by_collaborator_id UUID REFERENCES public.collaborators(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_referred_by_collaborator_id
  ON public.leads(referred_by_collaborator_id);

-- 2) Tokens de acceso al portal (scope distinto de referral links)
CREATE TABLE IF NOT EXISTS public.collaborator_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE CHECK (length(token) >= 32),
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collaborator_access_tokens_token
  ON public.collaborator_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_collaborator_access_tokens_collaborator_id
  ON public.collaborator_access_tokens(collaborator_id);

ALTER TABLE public.collaborator_access_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage collaborator_access_tokens" ON public.collaborator_access_tokens;
CREATE POLICY "Admins can manage collaborator_access_tokens"
  ON public.collaborator_access_tokens
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Public can read active collaborator_access_tokens" ON public.collaborator_access_tokens;
CREATE POLICY "Public can read active collaborator_access_tokens"
  ON public.collaborator_access_tokens
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

GRANT ALL ON public.collaborator_access_tokens TO service_role;

-- 3) Facturas de comisión del colaborador
CREATE TABLE IF NOT EXISTS public.collaborator_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  payout_id UUID REFERENCES public.collaborator_payouts(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  invoice_number TEXT,
  amount_eur NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'approved', 'paid', 'rejected')),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_invoices_collaborator_id
  ON public.collaborator_invoices(collaborator_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_invoices_payout_id
  ON public.collaborator_invoices(payout_id);
CREATE INDEX IF NOT EXISTS idx_collaborator_invoices_status
  ON public.collaborator_invoices(status);

ALTER TABLE public.collaborator_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage collaborator_invoices" ON public.collaborator_invoices;
CREATE POLICY "Admins can manage collaborator_invoices"
  ON public.collaborator_invoices
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

GRANT ALL ON public.collaborator_invoices TO service_role;

-- 4) Bucket para documentos de colaborador (facturas comisión)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'collaborator-documents',
  'collaborator-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins full access collaborator-documents" ON storage.objects;
CREATE POLICY "Admins full access collaborator-documents"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'collaborator-documents'
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    bucket_id = 'collaborator-documents'
    AND has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Service role full access collaborator-documents" ON storage.objects;
CREATE POLICY "Service role full access collaborator-documents"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'collaborator-documents')
  WITH CHECK (bucket_id = 'collaborator-documents');

-- 5) Etiqueta en referral links para gestión admin
ALTER TABLE public.collaborator_referral_links
  ADD COLUMN IF NOT EXISTS label TEXT;
