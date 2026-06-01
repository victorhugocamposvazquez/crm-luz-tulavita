-- Amplía los tipos de documento de cliente para incluir 'contract' (contratos, escrituras, CIF, etc.).

ALTER TABLE public.client_documents
  DROP CONSTRAINT IF EXISTS client_documents_doc_type_check;

ALTER TABLE public.client_documents
  ADD CONSTRAINT client_documents_doc_type_check
  CHECK (doc_type IN ('dni', 'invoice', 'contract'));

COMMENT ON COLUMN public.client_documents.doc_type IS
  'Tipo de documento del cliente: dni, invoice (factura) o contract (contrato/escrituras/CIF/otros).';
