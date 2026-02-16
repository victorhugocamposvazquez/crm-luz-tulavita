-- Log de intentos para rate limit por IP (process-invoice)
-- Se borran filas antiguas desde el propio API para no crecer indefinidamente
CREATE TABLE public.process_invoice_rate_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_process_invoice_rate_log_ip_created ON public.process_invoice_rate_log(ip, created_at DESC);

ALTER TABLE public.process_invoice_rate_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access process_invoice_rate_log"
  ON public.process_invoice_rate_log FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.process_invoice_rate_log TO service_role;
