export type CollaboratorEntryMode = 'auto' | 'upload' | 'manual' | 'callback';

export const ENTRY_MODE_LABELS: Record<CollaboratorEntryMode, string> = {
  auto: 'Captación completa',
  upload: 'Subir factura directo',
  manual: 'Datos manuales (kWh)',
  callback: 'Solo contacto',
};

export const ENTRY_MODE_SHORT: Record<CollaboratorEntryMode, string> = {
  auto: 'Auto',
  upload: 'Factura',
  manual: 'Manual',
  callback: 'Contacto',
};

export const ALL_ENTRY_MODES: CollaboratorEntryMode[] = ['auto', 'upload', 'manual', 'callback'];

export function isRecruitmentCampaign(campaign: string | null | undefined): boolean {
  return typeof campaign === 'string' && campaign.startsWith('colaboradores_');
}
