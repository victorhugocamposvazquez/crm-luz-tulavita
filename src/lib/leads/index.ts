/**
 * Módulo de leads - exports públicos
 */

export { createLead } from './createLead';
export { findExistingLead } from './deduplicator';
export {
  normalizePhone,
  normalizeEmail,
  normalizeName,
  normalizeSource,
  normalizeLeadInput,
} from './normalizer';
export type {
  Lead,
  LeadInput,
  LeadSource,
  LeadStatus,
  LeadEvent,
  CreateLeadResult,
  CreateLeadError,
} from './types';
export { LEAD_SOURCES, LEAD_STATUSES } from './types';
