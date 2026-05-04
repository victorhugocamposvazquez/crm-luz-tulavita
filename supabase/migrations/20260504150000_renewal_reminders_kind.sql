-- Tipos de recordatorio (renovación, fin contrato, etc.) y soporte de hora en reminder_date (ya TIMESTAMPTZ).

ALTER TABLE public.renewal_reminders
  ADD COLUMN IF NOT EXISTS reminder_kind TEXT NOT NULL DEFAULT 'renewal'
    CHECK (reminder_kind IN ('renewal', 'contract_end', 'recontact', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_label TEXT;

COMMENT ON COLUMN public.renewal_reminders.reminder_kind IS 'renewal | contract_end | recontact | custom';
COMMENT ON COLUMN public.renewal_reminders.custom_label IS 'Texto libre cuando reminder_kind = custom';

CREATE INDEX IF NOT EXISTS idx_renewal_reminders_kind ON public.renewal_reminders(reminder_kind);
