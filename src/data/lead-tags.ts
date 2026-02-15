/**
 * Definiciones de etiquetas para leads (desde lead-tags.json)
 */

import type { LeadTagDefinition } from './lead-tags.types';
import data from './lead-tags.json';

export const LEAD_TAGS: LeadTagDefinition[] = data.tags as LeadTagDefinition[];

const byId = new Map(LEAD_TAGS.map((t) => [t.id, t]));

export function getLeadTagById(id: string): LeadTagDefinition | undefined {
  return byId.get(id);
}

export function getLeadTagsByCategory(category: LeadTagDefinition['category']): LeadTagDefinition[] {
  return LEAD_TAGS.filter((t) => t.category === category);
}

export const LEAD_TAG_CATEGORIES = ['estado', 'interes', 'accion', 'prioridad'] as const;
