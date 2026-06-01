-- Acceso al portal por código OTP enviado al email registrado del colaborador.
-- El código se guarda hasheado (nunca en claro). La verificación crea un token
-- de sesión en collaborator_access_tokens con expiración (reutiliza el portal).

CREATE TABLE IF NOT EXISTS public.collaborator_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaborator_id UUID NOT NULL REFERENCES public.collaborators(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at TIMESTAMPTZ,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_otp_codes_email_created_at
  ON public.collaborator_otp_codes(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collaborator_otp_codes_collaborator_id
  ON public.collaborator_otp_codes(collaborator_id);

-- Solo el service_role (APIs backend) gestiona los códigos. Nadie más debe leerlos.
ALTER TABLE public.collaborator_otp_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.collaborator_otp_codes TO service_role;
