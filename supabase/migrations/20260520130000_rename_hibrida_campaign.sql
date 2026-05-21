-- Renombrar campaña de reclutamiento: colaboradores_hibrida → hazte_colaborador

UPDATE public.leads
SET campaign = 'hazte_colaborador'
WHERE campaign = 'colaboradores_hibrida';

UPDATE public.lead_entries
SET campaign = 'hazte_colaborador'
WHERE campaign = 'colaboradores_hibrida';
