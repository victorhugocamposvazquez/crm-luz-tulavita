-- Unificar campañas de reclutamiento en hazte_colaborador

UPDATE public.leads
SET campaign = 'hazte_colaborador'
WHERE campaign IN ('colaboradores_hibrida', 'colaboradores_compacta');

UPDATE public.lead_entries
SET campaign = 'hazte_colaborador'
WHERE campaign IN ('colaboradores_hibrida', 'colaboradores_compacta');
