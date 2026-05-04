-- Suscripciones Web Push para admins (recordatorios con navegador cerrado).

CREATE TABLE IF NOT EXISTS public.admin_web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_web_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage own web push subscriptions"
ON public.admin_web_push_subscriptions
FOR ALL
USING (
  auth.uid() = user_id
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  auth.uid() = user_id
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

DROP TRIGGER IF EXISTS update_admin_web_push_subscriptions_updated_at ON public.admin_web_push_subscriptions;
CREATE TRIGGER update_admin_web_push_subscriptions_updated_at
BEFORE UPDATE ON public.admin_web_push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_admin_web_push_subscriptions_user_id
  ON public.admin_web_push_subscriptions(user_id);

ALTER TABLE public.renewal_reminders
  ADD COLUMN IF NOT EXISTS web_push_sent_at timestamptz;

COMMENT ON COLUMN public.renewal_reminders.web_push_sent_at IS
  'Marca de envío exitoso de web push a admins; el aviso en pestaña omite estos para no duplicar.';

GRANT ALL ON public.admin_web_push_subscriptions TO authenticated;
GRANT ALL ON public.admin_web_push_subscriptions TO service_role;
