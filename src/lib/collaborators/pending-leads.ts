import { isRecruitmentCampaign } from '@/components/colaboradores/colaboradores-config';

/** Estados de un candidato a colaborador que aún no se ha convertido. */
export const PENDING_RECRUITMENT_STATUSES = ['new', 'contacted', 'qualified'] as const;

/** Estados de un cliente captado que aún no se ha atendido. */
export const PENDING_CAPTURED_STATUS = 'new' as const;

type LeadLike = {
  source: string;
  campaign: string | null;
  collaborator_id?: string | null;
};

/** Mismo criterio que ConvertLeadDialog / RecruitmentLeadsSection. */
export function isRecruitmentLeadRow(lead: LeadLike): boolean {
  return lead.source === 'web_form' && isRecruitmentCampaign(lead.campaign);
}

/** Cliente referido por un colaborador (funnel de captación), no candidato a colaborador. */
export function isCapturedClientLeadRow(lead: LeadLike): boolean {
  return lead.source === 'collaborator_referral' && lead.collaborator_id != null;
}
