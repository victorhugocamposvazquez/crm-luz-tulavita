/**
 * Lógica de deduplicación de leads
 * Prioridad: phone > email
 * Evita duplicados y mantiene historial vía eventos
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface DeduplicationResult {
  existingId: string | null;
  matchBy: 'phone' | 'email' | null;
}

/**
 * Busca lead existente por phone o email (en ese orden)
 * Usa índices para rendimiento
 */
export async function findExistingLead(
  supabase: SupabaseClient,
  phone: string | null,
  email: string | null
): Promise<DeduplicationResult> {
  // 1. Buscar por teléfono (prioridad)
  if (phone) {
    const { data: byPhone } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    if (byPhone?.id) {
      return { existingId: byPhone.id, matchBy: 'phone' };
    }
  }

  // 2. Buscar por email (lowercase)
  if (email) {
    const { data: byEmail } = await supabase
      .from('leads')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (byEmail?.id) {
      return { existingId: byEmail.id, matchBy: 'email' };
    }
  }

  return { existingId: null, matchBy: null };
}
