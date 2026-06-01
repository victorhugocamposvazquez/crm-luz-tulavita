/** Configuración pública de landings de colaboradores. */
export const TV_BRAND = 'Tulavita Energía';

const rawWa =
  import.meta.env.VITE_COLABORADORES_WA_NUMBER ||
  import.meta.env.VITE_WHATSAPP_NUMBER ||
  '34600000000';

export const WA_NUMBER = String(rawWa).replace(/\D/g, '') || '34600000000';

export const TEL_NUMBER =
  import.meta.env.VITE_COLABORADORES_TEL || import.meta.env.VITE_CONTACT_PHONE || '+34600000000';

export function waLink(message: string): string {
  return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Única landing/campaña de reclutamiento de colaboradores. */
export const COLABORADORES_RECRUITMENT_CAMPAIGN = 'hazte_colaborador';
export const COLABORADORES_RECRUITMENT_ROUTE = '/hazte-colaborador';

/**
 * Las campañas legacy (colaboradores_compacta/hibrida) se migraron a
 * 'hazte_colaborador' (ver 20260520130000_rename_hibrida_campaign.sql), por lo
 * que solo existe una campaña de reclutamiento.
 */
export const RECRUITMENT_CAMPAIGNS = [COLABORADORES_RECRUITMENT_CAMPAIGN] as const;

export function isRecruitmentCampaign(campaign: string | null | undefined): boolean {
  if (typeof campaign !== 'string') return false;
  return (RECRUITMENT_CAMPAIGNS as readonly string[]).includes(campaign);
}
