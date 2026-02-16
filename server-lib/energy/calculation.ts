/**
 * Cálculo de ahorro: ofertas activas, coste oferta, mejor oferta, validaciones.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceExtraction } from '../invoice/types.js';
import { normalizeCompanyName } from '../invoice/extract-fields.js';

export interface EnergyOffer {
  id: string;
  company_name: string;
  price_per_kwh: number;
  monthly_fixed_cost: number;
  active: boolean;
}

export interface ComparisonResult {
  current_company: string | null;
  current_monthly_cost: number;
  best_offer_company: string;
  best_offer_monthly_cost: number;
  estimated_savings_amount: number;
  estimated_savings_percentage: number;
  prudent_mode: boolean;
}

const PRUDENT_PERCENT = 45;
const PRUDENT_MIN_PERCENT = 8;
const MIN_CONSUMPTION_KWH = 50;
const MAX_CONSUMPTION_KWH = 5000;
const MIN_OCR_CONFIDENCE = 0.8;

export async function getActiveOffers(supabase: SupabaseClient): Promise<EnergyOffer[]> {
  const { data, error } = await supabase
    .from('energy_offers')
    .select('id, company_name, price_per_kwh, monthly_fixed_cost, active')
    .eq('active', true);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    company_name: r.company_name,
    price_per_kwh: Number(r.price_per_kwh),
    monthly_fixed_cost: Number(r.monthly_fixed_cost),
    active: r.active,
  }));
}

/** Coste mensual de una oferta para un consumo dado (kWh/mes). */
export function monthlyCost(consumptionKwh: number, offer: EnergyOffer): number {
  return consumptionKwh * offer.price_per_kwh + offer.monthly_fixed_cost;
}

/**
 * Normaliza factura a coste mensual y obtiene ofertas comparables (excluyendo misma comercializadora).
 */
export function runComparison(
  extraction: InvoiceExtraction,
  offers: EnergyOffer[]
): ComparisonResult | null {
  const consumption = extraction.consumption_kwh;
  const totalFactura = extraction.total_factura;
  const periodMonths = Math.max(1, extraction.period_months || 1);
  const currentCompany = extraction.company_name ? normalizeCompanyName(extraction.company_name) : null;

  if (consumption == null || consumption <= 0 || totalFactura == null || totalFactura <= 0) {
    return null;
  }

  const currentMonthlyCost = totalFactura / periodMonths;
  const consumptionMonthly = consumption / periodMonths;

  const comparable = offers.filter((o) => {
    const name = o.company_name.trim().toLowerCase();
    const current = (currentCompany || '').trim().toLowerCase();
    return name !== current;
  });

  if (comparable.length === 0) return null;

  let best = comparable[0];
  let bestCost = monthlyCost(consumptionMonthly, best);
  for (let i = 1; i < comparable.length; i++) {
    const cost = monthlyCost(consumptionMonthly, comparable[i]);
    if (cost < bestCost) {
      bestCost = cost;
      best = comparable[i];
    }
  }

  const savingsAmount = currentMonthlyCost - bestCost;
  const savingsPercent = currentMonthlyCost > 0 ? (savingsAmount / currentMonthlyCost) * 100 : 0;

  if (savingsPercent < 0) return null;

  const prudentMode =
    savingsPercent > PRUDENT_PERCENT ||
    consumption < MIN_CONSUMPTION_KWH ||
    consumption > MAX_CONSUMPTION_KWH ||
    (extraction.confidence > 0 && extraction.confidence < MIN_OCR_CONFIDENCE);

  return {
    current_company: currentCompany,
    current_monthly_cost: Math.round(currentMonthlyCost * 100) / 100,
    best_offer_company: best.company_name,
    best_offer_monthly_cost: Math.round(bestCost * 100) / 100,
    estimated_savings_amount: Math.round(savingsAmount * 100) / 100,
    estimated_savings_percentage: Math.round(savingsPercent * 100) / 100,
    prudent_mode: prudentMode,
  };
}

export function shouldShowExactSavings(result: ComparisonResult, minPercent: number = PRUDENT_MIN_PERCENT): boolean {
  if (result.estimated_savings_percentage < minPercent) return false;
  if (result.prudent_mode) return false;
  return true;
}
