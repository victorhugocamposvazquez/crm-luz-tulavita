-- Hardening del portal de colaboradores:
-- 1) Eliminar lectura pública (anon) de tokens: la resolución pasa siempre por las
--    APIs serverless con service_role, nunca desde el cliente con anon key.
-- 2) Tokens de sesión del portal con expiración obligatoria (60 días por defecto).

-- 1) Quitar políticas de lectura pública sobre tokens
DROP POLICY IF EXISTS "Public can read active collaborator_access_tokens" ON public.collaborator_access_tokens;
DROP POLICY IF EXISTS "Public can read active collaborator_referral_links" ON public.collaborator_referral_links;

-- Sin acceso de anon/authenticated genérico: quedan solo las políticas de admin
-- ("Admins can manage ...") y los GRANT a service_role ya existentes.

-- 2) Expiración obligatoria en tokens de sesión del portal
UPDATE public.collaborator_access_tokens
SET expires_at = now() + interval '60 days'
WHERE expires_at IS NULL;

ALTER TABLE public.collaborator_access_tokens
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '60 days'),
  ALTER COLUMN expires_at SET NOT NULL;
