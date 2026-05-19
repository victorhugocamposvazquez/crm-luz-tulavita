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

export type ColaboradoresLandingVariant = 'compacta' | 'hibrida';

export const COLABORADORES_CAMPAIGNS: Record<ColaboradoresLandingVariant, string> = {
  compacta: 'colaboradores_compacta',
  hibrida: 'colaboradores_hibrida',
};
