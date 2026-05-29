-- Zona "Carpetas" del CRM: carpetas planas (un nivel) con archivos, solo administradores.
-- Metadatos en Postgres; binarios en el bucket privado crm-folders.

CREATE TABLE public.crm_folders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_folders_client_id ON public.crm_folders(client_id);
CREATE INDEX idx_crm_folders_created_at ON public.crm_folders(created_at DESC);

CREATE TABLE public.crm_folder_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  folder_id UUID NOT NULL REFERENCES public.crm_folders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

CREATE INDEX idx_crm_folder_files_folder_id ON public.crm_folder_files(folder_id);

COMMENT ON TABLE public.crm_folders IS 'Carpetas planas del CRM (zona de archivos admin); client_id opcional.';
COMMENT ON TABLE public.crm_folder_files IS 'Archivos dentro de carpetas del CRM; el binario vive en bucket crm-folders.';

ALTER TABLE public.crm_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_folder_files ENABLE ROW LEVEL SECURITY;

-- Solo administradores en las dos tablas.
CREATE POLICY "Admins manage crm_folders"
  ON public.crm_folders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins manage crm_folder_files"
  ON public.crm_folder_files
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Bucket privado para los archivos de carpetas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-folders',
  'crm-folders',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg','image/png','image/webp','image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Admins read crm-folders storage"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-folders'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins upload crm-folders storage"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'crm-folders'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins update crm-folders storage"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'crm-folders'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    bucket_id = 'crm-folders'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Admins delete crm-folders storage"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'crm-folders'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Service role full access crm-folders storage"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'crm-folders')
  WITH CHECK (bucket_id = 'crm-folders');
