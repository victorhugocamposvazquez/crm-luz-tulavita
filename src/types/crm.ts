/**
 * Tipos para el CRM operativo: entradas, conversaciones y mensajes
 */

export const LEAD_ENTRY_SOURCES = [
  'meta_lead_ads',
  'meta_ads_web',
  'web_form',
  'manual',
  'csv_import',
] as const;

export type LeadEntrySource = (typeof LEAD_ENTRY_SOURCES)[number];

export const CONVERSATION_CHANNELS = ['whatsapp', 'call', 'email'] as const;
export type ConversationChannel = (typeof CONVERSATION_CHANNELS)[number];

export const CONVERSATION_STATUSES = ['open', 'closed'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface LeadEntry {
  id: string;
  lead_id: string;
  source: string;
  campaign: string | null;
  adset: string | null;
  ad: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export interface LeadConversation {
  id: string;
  lead_id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  created_at: string;
  updated_at: string;
}

export interface LeadMessage {
  id: string;
  conversation_id: string;
  direction: MessageDirection;
  content: string | null;
  status: MessageStatus;
  created_at: string;
  user_id: string | null;
}

export interface CreateLeadEntryInput {
  lead_id: string;
  source: string;
  campaign?: string | null;
  adset?: string | null;
  ad?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface CreateLeadEntryResult {
  success: true;
  entry: LeadEntry;
  conversation: LeadConversation;
}

export interface CreateLeadEntryError {
  success: false;
  error: string;
  code?: string;
}

export type CreateLeadEntryResponse = CreateLeadEntryResult | CreateLeadEntryError;
