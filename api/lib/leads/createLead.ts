/**
 * Función principal createLead() (copia para API Vercel)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LeadInput, Lead, CreateLeadResult, CreateLeadError } from './types.js';
import {
  normalizePhone,
  normalizeEmail,
  normalizeName,
  normalizeSource,
} from './normalizer.js';
import { findExistingLead } from './deduplicator.js';

function hasMinRequiredField(input: LeadInput): boolean {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  return !!(phone || email);
}

function validateInput(input: LeadInput): string | null {
  if (!input || typeof input !== 'object') {
    return 'Datos requeridos inválidos';
  }
  if (!hasMinRequiredField(input)) {
    return 'Se requiere al menos teléfono o email';
  }
  return null;
}

export async function createLead(
  supabase: SupabaseClient,
  input: LeadInput,
  options?: {
    defaultOwnerId?: string;
    createInitialTask?: boolean;
  }
): Promise<CreateLeadResult | CreateLeadError> {
  const err = validateInput(input);
  if (err) {
    return { success: false, error: err, code: 'VALIDATION_ERROR' };
  }

  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const name = normalizeName(input.name);
  const source = normalizeSource(input.source);

  const { existingId, matchBy } = await findExistingLead(supabase, phone, email);

  if (existingId) {
    const { data: updated, error } = await supabase
      .from('leads')
      .update({
        name: name ?? undefined,
        phone: phone ?? undefined,
        email: email ?? undefined,
        source: source,
        campaign: input.campaign ?? undefined,
        adset: input.adset ?? undefined,
        ad: input.ad ?? undefined,
        tags: input.tags ?? undefined,
        custom_fields: input.custom_fields ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingId)
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: error.message,
        code: 'UPDATE_ERROR',
      };
    }

    await supabase.from('lead_events').insert({
      lead_id: existingId,
      type: 'lead_updated',
      content: {
        matchBy,
        updatedFields: input,
        source,
      },
    });

    const lead = updated as Lead;

    if (options?.createInitialTask) {
      await createInitialTask(supabase, lead, options.defaultOwnerId);
    }

    return {
      success: true,
      lead,
      isNew: false,
      eventType: 'lead_updated',
    };
  }

  const ownerId = input.owner_id ?? options?.defaultOwnerId ?? null;

  const { data: inserted, error } = await supabase
    .from('leads')
    .insert({
      name: name,
      phone: phone,
      email: email,
      source: source,
      campaign: input.campaign ?? null,
      adset: input.adset ?? null,
      ad: input.ad ?? null,
      status: input.status ?? 'new',
      owner_id: ownerId,
      tags: input.tags ?? [],
      custom_fields: input.custom_fields ?? {},
    })
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message,
      code: 'INSERT_ERROR',
    };
  }

  const lead = inserted as Lead;

  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    type: 'lead_created',
    content: {
      source,
      campaign: input.campaign,
      adset: input.adset,
      ad: input.ad,
    },
  });

  if (options?.createInitialTask) {
    await createInitialTask(supabase, lead, options.defaultOwnerId);
  }

  return {
    success: true,
    lead,
    isNew: true,
    eventType: 'lead_created',
  };
}

async function createInitialTask(
  supabase: SupabaseClient,
  lead: Lead,
  defaultOwnerId?: string | null
): Promise<void> {
  const ownerId = lead.owner_id ?? defaultOwnerId;
  if (!ownerId) return;

  try {
    await supabase.from('admin_tasks').insert({
      type: 'lead_contact',
      title: `Contactar lead: ${lead.name ?? lead.email ?? lead.phone ?? 'Sin nombre'}`,
      description: `Lead nuevo desde ${lead.source}`,
      status: 'pending',
      commercial_id: ownerId,
      client_id: null,
    });
  } catch {
    // admin_tasks puede no soportar type 'lead_contact' aún; se ignora silenciosamente
  }
}
