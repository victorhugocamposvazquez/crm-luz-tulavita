/**
 * Lógica de deduplicación de leads (copia para API Vercel)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function findExistingLead(
  supabase: SupabaseClient,
  phone: string | null,
  email: string | null
): Promise<{ existingId: string | null; matchBy: 'phone' | 'email' | null }> {
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
