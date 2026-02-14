-- Bucket para facturas adjuntas de leads (formulario público sube; solo autenticados leen)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-attachments',
  'lead-attachments',
  false,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anónimos (formulario web) pueden subir
CREATE POLICY "Allow anon to upload lead attachments"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'lead-attachments');

-- Autenticados (CRM) pueden leer para previsualizar
CREATE POLICY "Allow authenticated to read lead attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'lead-attachments');

-- Service role para signed URLs desde el backend si hace falta
CREATE POLICY "Allow service role full access lead attachments"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'lead-attachments')
WITH CHECK (bucket_id = 'lead-attachments');
