-- Documentación de clientes (DNI, facturas): metadatos en Postgres; archivos en Storage.

CREATE TABLE public.client_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('dni', 'invoice')),
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

CREATE INDEX idx_client_documents_client_id ON public.client_documents(client_id);
CREATE INDEX idx_client_documents_client_type ON public.client_documents(client_id, doc_type);

COMMENT ON TABLE public.client_documents IS 'Metadatos de adjuntos del cliente; el binario vive en bucket client-documents.';
COMMENT ON COLUMN public.client_documents.storage_path IS 'Ruta relativa en el bucket client-documents.';

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commercials and admins can view client documents"
  ON public.client_documents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

CREATE POLICY "Commercials and admins can insert client documents"
  ON public.client_documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

CREATE POLICY "Commercials and admins can delete client documents"
  ON public.client_documents
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('commercial', 'admin')
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "CRM staff can read client documents storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'commercial'::public.app_role)
    )
  );

CREATE POLICY "CRM staff can upload client documents storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'commercial'::public.app_role)
    )
  );

CREATE POLICY "CRM staff can update client documents storage"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'commercial'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'commercial'::public.app_role)
    )
  );

CREATE POLICY "CRM staff can delete client documents storage"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-documents'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'commercial'::public.app_role)
    )
  );

CREATE POLICY "Service role full access client documents storage"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'client-documents')
  WITH CHECK (bucket_id = 'client-documents');
