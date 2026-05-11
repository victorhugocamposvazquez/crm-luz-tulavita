-- Detección ampliada de clientes Iberdrola (muchas fichas solo tienen label/nota en suministro o import_external_key).

UPDATE public.clients c
SET comercializadora = 'IBERDROLA CLIENTES, S.A.U.'
WHERE (c.comercializadora IS NULL OR btrim(c.comercializadora) = '')
  AND (
    c.import_source = 'iberdrola_operaciones_csv'
    OR c.import_external_key LIKE 'iberdrola_cli_%'
    OR EXISTS (
      SELECT 1
      FROM public.client_supply_addresses s
      WHERE s.client_id = c.id
        AND (
          COALESCE(s.note, '') ILIKE '%iberdrola%'
          OR COALESCE(s.label, '') ILIKE '%iberdrola%'
        )
    )
  );

CREATE OR REPLACE FUNCTION public.clients_ids_matching_comercializadora(p_filter text)
RETURNS TABLE(id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.clients c
  WHERE length(trim(coalesce(p_filter, ''))) > 0
    AND (
      (
        length(trim(coalesce(c.comercializadora, ''))) > 0
        AND lower(trim(c.comercializadora)) = lower(trim(p_filter))
      )
      OR (
        lower(trim(p_filter)) = lower('IBERDROLA CLIENTES, S.A.U.')
        AND (
          c.import_source = 'iberdrola_operaciones_csv'
          OR c.import_external_key LIKE 'iberdrola_cli_%'
          OR EXISTS (
            SELECT 1
            FROM public.client_supply_addresses s
            WHERE s.client_id = c.id
              AND (
                COALESCE(s.note, '') ILIKE '%iberdrola%'
                OR COALESCE(s.label, '') ILIKE '%iberdrola%'
              )
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.clients_ids_matching_comercializadora(text) IS
  'Filtra clientes por comercializadora; Iberdrola incluye import CSV, import_external_key iberdrola_cli_% y suministros con Iberdrola en label/nota.';

GRANT EXECUTE ON FUNCTION public.clients_ids_matching_comercializadora(text) TO authenticated;
