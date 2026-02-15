/**
 * Tipos para el sistema de etiquetas de leads.
 * Datos en lead-tags.json
 */

export type LeadTagCategory = 'estado' | 'interes' | 'accion' | 'prioridad';

export interface LeadTagDefinition {
  id: string;
  name: string;
  category: LeadTagCategory;
  color: string;
}

export interface LeadTagsPayload {
  lead_id: string;
  tags: string[];
}

export const LEAD_TAG_CATEGORY_LABELS: Record<LeadTagCategory, string> = {
  estado: 'Estado (seguimiento)',
  interes: 'Interés',
  accion: 'Acción / Documentación',
  prioridad: 'Prioridad',
};
