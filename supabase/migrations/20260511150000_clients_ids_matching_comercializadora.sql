-- Filtrado fiable por comercializadora desde la app (evita URLs .or rotas por comas en el nombre CNMC).
-- Iberdrola: incluye clientes con import_source = iberdrola_operaciones_csv aunque comercializadora sea NULL.

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
        AND c.import_source = 'iberdrola_operaciones_csv'
      )
    );
$$;

COMMENT ON FUNCTION public.clients_ids_matching_comercializadora(text) IS
  'IDs de clientes para filtro comercializadora en CRM; Iberdrola amplía con import_source iberdrola_operaciones_csv.';

GRANT EXECUTE ON FUNCTION public.clients_ids_matching_comercializadora(text) TO authenticated;
