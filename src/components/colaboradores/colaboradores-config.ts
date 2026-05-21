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

/** Única landing activa de reclutamiento de colaboradores. */
export const COLABORADORES_RECRUITMENT_CAMPAIGN = 'hazte_colaborador';
export const COLABORADORES_RECRUITMENT_ROUTE = '/hazte-colaborador';

/** Campañas legacy (consultas históricas tras migración de datos). */
export const RECRUITMENT_CAMPAIGNS_LEGACY = ['colaboradores_compacta', 'colaboradores_hibrida'] as const;

export const RECRUITMENT_CAMPAIGNS = [
  COLABORADORES_RECRUITMENT_CAMPAIGN,
  ...RECRUITMENT_CAMPAIGNS_LEGACY,
] as const;

export function isRecruitmentCampaign(campaign: string | null | undefined): boolean {
  if (typeof campaign !== 'string') return false;
  return (RECRUITMENT_CAMPAIGNS as readonly string[]).includes(campaign);
}
