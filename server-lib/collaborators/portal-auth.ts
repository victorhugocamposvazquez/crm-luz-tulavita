import type { SupabaseClient } from '@supabase/supabase-js';

export type PortalCollaborator = {
  id: string;
  code: string;
  name: string;
  commission_per_converted_eur: number;
  email: string | null;
  phone: string | null;
};

export async function resolvePortalToken(
  supabase: SupabaseClient,
  token: string,
): Promise<{ collaborator: PortalCollaborator; tokenId: string } | null> {
  const normalized = token.trim();
  if (normalized.length < 32) return null;

  const { data, error } = await supabase
    .from('collaborator_access_tokens')
    .select(
      'id, expires_at, collaborators!inner(id, code, name, commission_per_converted_eur, email, phone, is_active)',
    )
    .eq('token', normalized)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    id: string;
    expires_at?: string | null;
    collaborators?: PortalCollaborator & { is_active: boolean };
  };

  const collab = row.collaborators;
  if (!collab?.is_active) return null;

  const expired = !!(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());
  if (expired) return null;

  await supabase
    .from('collaborator_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id);

  return { collaborator: collab, tokenId: row.id };
}
