import type { CollaboratorEntryMode } from '@/lib/collaborators/types';

export type PortalCollaborator = {
  id: string;
  code: string;
  name: string;
  commission_per_converted_eur: number;
  email: string | null;
  phone: string | null;
};

export type PortalStats = {
  leads_total: number;
  leads_commissionable: number;
};

export type PortalPayout = {
  id: string;
  amount_total_eur: number;
  leads_count: number;
  status: string;
  created_at: string;
};

export type PortalReferralLink = {
  id: string;
  token: string;
  entry_mode: CollaboratorEntryMode;
  is_active: boolean;
  expires_at: string | null;
};

export type PortalCapturedClient = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  commission_eligible?: boolean;
  has_invoice: boolean;
  comparison_status: string | null;
  estimated_savings_percentage: number | null;
  estimated_savings_amount: number | null;
};

export type PortalCommissionInvoiceStatus = 'submitted' | 'approved' | 'paid' | 'rejected' | 'cancelled';

export type PortalCommissionInvoice = {
  id: string;
  payout_id: string | null;
  file_name: string | null;
  invoice_number: string | null;
  amount_eur: number | null;
  status: PortalCommissionInvoiceStatus;
  rejection_reason: string | null;
  submitted_at: string;
};

export type PortalData = {
  collaborator: PortalCollaborator;
  stats: PortalStats;
  pending_payouts: PortalPayout[];
  referral_links: PortalReferralLink[];
  captured_clients: PortalCapturedClient[];
  commission_invoices: PortalCommissionInvoice[];
};

export const COMMISSION_INVOICE_STATUS: Record<PortalCommissionInvoiceStatus, string> = {
  submitted: 'En revisión',
  approved: 'Aprobada',
  paid: 'Pagada',
  rejected: 'Rechazada',
  cancelled: 'Anulada',
};

export const CLIENT_STATUS_LABELS: Record<string, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  converted: 'Convertido',
  lost: 'Perdido',
};

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
