-- Ajustes del programa de colaboradores. Una sola fila (id = 1).
-- Define la persona responsable de gestionar colaboradores: a ella se asignan
-- automáticamente los leads de reclutamiento y de captación por colaborador.

CREATE TABLE IF NOT EXISTS public.collaborator_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  collaborator_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.collaborator_settings IS 'Ajustes del programa de colaboradores (fila única id=1).';
COMMENT ON COLUMN public.collaborator_settings.collaborator_manager_id IS 'Perfil responsable de colaboradores; recibe por defecto los leads de reclutamiento y captación.';

INSERT INTO public.collaborator_settings (id, collaborator_manager_id)
VALUES (1, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.collaborator_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read collaborator_settings" ON public.collaborator_settings;
CREATE POLICY "Authenticated read collaborator_settings"
  ON public.collaborator_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin update collaborator_settings" ON public.collaborator_settings;
CREATE POLICY "Admin update collaborator_settings"
  ON public.collaborator_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.collaborator_settings TO authenticated;
GRANT UPDATE ON public.collaborator_settings TO authenticated;
GRANT ALL ON public.collaborator_settings TO service_role;
