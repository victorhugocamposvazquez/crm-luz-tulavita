-- Estado de tramitación para facturas de cliente (pendiente vs tramitada).

ALTER TABLE public.client_documents
  ADD COLUMN IF NOT EXISTS processing_status TEXT;

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_processing_status_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_processing_status_check
  CHECK (
    processing_status IS NULL
    OR processing_status IN ('pending', 'processed')
  );

UPDATE public.client_documents
SET processing_status = 'processed'
WHERE doc_type = 'invoice' AND processing_status IS NULL;

COMMENT ON COLUMN public.client_documents.processing_status IS
  'Solo facturas (doc_type=invoice): pending = no tramitada, processed = tramitada.';

CREATE POLICY "Commercials and admins can update client documents"
  ON public.client_documents
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );
