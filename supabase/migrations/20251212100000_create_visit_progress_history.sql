-- =====================================================
-- MIGRACIÓN: Crear tabla visit_progress_history
-- HITO 1: Historial de progresos en visitas
-- =====================================================
-- Esta migración es ADITIVA: no modifica datos existentes

CREATE TABLE public.visit_progress_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  commercial_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_accuracy DECIMAL(10, 2),
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visit_state_code TEXT REFERENCES public.visit_states(code),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX idx_visit_progress_history_visit_id ON public.visit_progress_history(visit_id);
CREATE INDEX idx_visit_progress_history_commercial_id ON public.visit_progress_history(commercial_id);
CREATE INDEX idx_visit_progress_history_recorded_at ON public.visit_progress_history(recorded_at);

-- Habilitar RLS
ALTER TABLE public.visit_progress_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Commercials can view their own progress history"
  ON public.visit_progress_history FOR SELECT
  USING (commercial_id = auth.uid());

CREATE POLICY "Commercials can create their own progress history"
  ON public.visit_progress_history FOR INSERT
  WITH CHECK (commercial_id = auth.uid());

CREATE POLICY "Admins can view all progress history"
  ON public.visit_progress_history FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all progress history"
  ON public.visit_progress_history FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger para updated_at (reutilizando función existente)
CREATE TRIGGER update_visit_progress_history_updated_at
  BEFORE UPDATE ON public.visit_progress_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
