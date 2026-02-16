-- Corregir RLS en storage para subida de facturas (anon y authenticated)
-- El error "new row violates row-level security" suele deberse a que no hay política INSERT
-- para el rol con el que se hace la petición (p. ej. authenticated si hay sesión abierta).

DROP POLICY IF EXISTS "Allow anon to upload lead attachments" ON storage.objects;
CREATE POLICY "Allow anon to upload lead attachments"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'lead-attachments');

-- Permitir también a usuarios autenticados (p. ej. si abren la landing con sesión del CRM)
DROP POLICY IF EXISTS "Allow authenticated to upload lead attachments" ON storage.objects;
CREATE POLICY "Allow authenticated to upload lead attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'lead-attachments');
