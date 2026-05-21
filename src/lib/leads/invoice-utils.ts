export function leadHasClientInvoice(customFields: unknown): boolean {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) return false;
  const cf = customFields as Record<string, unknown>;
  const adj = cf.adjuntar_factura;
  if (adj && typeof adj === 'object' && !Array.isArray(adj)) {
    const path = (adj as Record<string, unknown>).path;
    if (typeof path === 'string' && path.trim()) return true;
  }
  if (cf.manual_extraction && typeof cf.manual_extraction === 'object') return true;
  return false;
}

export type EnergyComparisonSummary = {
  id: string;
  status: string;
  current_company: string | null;
  current_monthly_cost: number | null;
  best_offer_company: string | null;
  estimated_savings_amount: number | null;
  estimated_savings_percentage: number | null;
  prudent_mode: boolean | null;
  error_message: string | null;
  created_at: string;
};

export function formatSavingsPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatEuro(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(2)} €`;
}

export function pickLatestComparison(
  rows: EnergyComparisonSummary[] | null | undefined,
): EnergyComparisonSummary | null {
  if (!rows?.length) return null;
  return [...rows].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}
