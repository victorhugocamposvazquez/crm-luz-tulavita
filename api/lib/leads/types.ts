/**
 * Tipos para el sistema de gestión de leads (copia para API Vercel)
 */

export const LEAD_SOURCES = [
  'web_form',
  'meta_lead_ads',
  'meta_ads_web',
  'csv_import',
  'manual',
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'converted',
  'lost',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadInput {
  name?: string;
  phone?: string;
  email?: string;
  source?: string;
  campaign?: string;
  adset?: string;
  ad?: string;
  status?: LeadStatus;
  owner_id?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  campaign: string | null;
  adset: string | null;
  ad: string | null;
  status: LeadStatus;
  owner_id: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateLeadResult {
  success: boolean;
  lead: Lead;
  isNew: boolean;
  eventType: 'lead_created' | 'lead_updated';
}

export interface CreateLeadError {
  success: false;
  error: string;
  code?: string;
}
