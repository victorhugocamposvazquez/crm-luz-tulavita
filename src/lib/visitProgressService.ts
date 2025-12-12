import { supabase } from '@/integrations/supabase/client';

export interface VisitProgressEntry {
  id: string;
  visit_id: string;
  commercial_id: string;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  recorded_at: string;
  visit_state_code: string | null;
  note: string | null;
  created_at: string;
  visit_states?: {
    name: string;
    description: string | null;
  };
}

export interface CreateProgressParams {
  visit_id: string;
  commercial_id: string;
  latitude?: number | null;
  longitude?: number | null;
  location_accuracy?: number | null;
  visit_state_code?: string | null;
  note?: string | null;
}

export async function createVisitProgress(params: CreateProgressParams): Promise<{ data: VisitProgressEntry | null; error: any }> {
  const { data, error } = await supabase
    .from('visit_progress_history')
    .insert({
      visit_id: params.visit_id,
      commercial_id: params.commercial_id,
      latitude: params.latitude,
      longitude: params.longitude,
      location_accuracy: params.location_accuracy,
      visit_state_code: params.visit_state_code,
      note: params.note,
    })
    .select()
    .single();

  return { data, error };
}

export async function getVisitProgressHistory(visitId: string): Promise<{ data: VisitProgressEntry[] | null; error: any }> {
  const { data, error } = await supabase
    .from('visit_progress_history')
    .select(`
      *,
      visit_states (
        name,
        description
      )
    `)
    .eq('visit_id', visitId)
    .order('recorded_at', { ascending: false });

  return { data, error };
}

export interface VisitChangeDetection {
  hasChanges: boolean;
  changedFields: string[];
}

export function detectVisitChanges(
  original: { visit_state_code?: string | null; notes?: string | null },
  updated: { visit_state_code?: string | null; note?: string | null }
): VisitChangeDetection {
  const changedFields: string[] = [];

  if (original.visit_state_code !== updated.visit_state_code) {
    changedFields.push('visit_state_code');
  }

  if (updated.note && updated.note.trim() !== '') {
    changedFields.push('note');
  }

  return {
    hasChanges: changedFields.length > 0,
    changedFields,
  };
}
