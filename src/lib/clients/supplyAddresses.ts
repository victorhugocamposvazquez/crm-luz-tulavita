import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

export type SupplyAddressDraft = {
  localId: string;
  dbId?: string;
  label: string;
  direccion: string;
  localidad: string;
  codigo_postal: string;
  cups: string;
  note: string;
};

export type SupplyAddressRow = Database['public']['Tables']['client_supply_addresses']['Row'];

export function emptySupplyAddressDraft(): SupplyAddressDraft {
  return {
    localId: crypto.randomUUID(),
    label: '',
    direccion: '',
    localidad: '',
    codigo_postal: '',
    cups: '',
    note: '',
  };
}

export function draftFromSupplyRow(row: SupplyAddressRow): SupplyAddressDraft {
  return {
    localId: row.id,
    dbId: row.id,
    label: row.label ?? '',
    direccion: row.direccion ?? '',
    localidad: row.localidad ?? '',
    codigo_postal: row.codigo_postal ?? '',
    cups: row.cups ?? '',
    note: row.note ?? '',
  };
}

function toPayload(d: SupplyAddressDraft, sortOrder: number) {
  const dir = d.direccion.trim();
  return {
    label: d.label.trim() || null,
    direccion: dir || null,
    localidad: d.localidad.trim() || null,
    codigo_postal: d.codigo_postal.trim() || null,
    cups: d.cups.trim().replace(/\s+/g, '') || null,
    note: d.note.trim() || null,
    sort_order: sortOrder,
  };
}

/** Mantiene filas en BD alineadas con los borradores del formulario (dirección y/o CUPS). */
export async function syncClientSupplyAddresses(
  supabase: SupabaseClient<Database>,
  clientId: string,
  drafts: SupplyAddressDraft[],
): Promise<{ error: Error | null }> {
  const valid = drafts.filter((d) => d.direccion.trim().length > 0 || d.cups.trim().length > 0);
  const { data: existing, error: fetchErr } = await supabase
    .from('client_supply_addresses')
    .select('id')
    .eq('client_id', clientId);

  if (fetchErr) return { error: new Error(fetchErr.message) };

  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set(valid.filter((d) => d.dbId).map((d) => d.dbId!));
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

  if (toDelete.length) {
    const { error: delErr } = await supabase.from('client_supply_addresses').delete().in('id', toDelete);
    if (delErr) return { error: new Error(delErr.message) };
  }

  for (let i = 0; i < valid.length; i++) {
    const d = valid[i];
    const payload = toPayload(d, i);
    if (d.dbId) {
      const { error: upErr } = await supabase.from('client_supply_addresses').update(payload).eq('id', d.dbId);
      if (upErr) return { error: new Error(upErr.message) };
    } else {
      const { error: insErr } = await supabase
        .from('client_supply_addresses')
        .insert({ ...payload, client_id: clientId });
      if (insErr) return { error: new Error(insErr.message) };
    }
  }

  return { error: null };
}

export function fullSupplyAddressLine(d: SupplyAddressDraft): string {
  const dir = (d.direccion ?? '').trim();
  const loc = (d.localidad ?? '').trim();
  const cp = (d.codigo_postal ?? '').trim();
  const parts = [dir, loc, cp].filter(Boolean);
  if (parts.length) return parts.join(', ');
  const cups = (d.cups ?? '').trim();
  if (cups) return `CUPS ${cups}`;
  return '';
}
