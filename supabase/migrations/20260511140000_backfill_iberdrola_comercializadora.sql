-- Clientes procedentes de operaciones Iberdrola: asociar comercializadora (CNMC).

UPDATE public.clients c
SET comercializadora = 'IBERDROLA CLIENTES, S.A.U.'
WHERE (c.comercializadora IS NULL OR btrim(c.comercializadora) = '')
  AND (
    c.import_source = 'iberdrola_operaciones_csv'
    OR EXISTS (
      SELECT 1
      FROM public.client_supply_addresses s
      WHERE s.client_id = c.id
        AND COALESCE(s.note, '') ILIKE '%iberdrola_operaciones_csv%'
    )
  );
