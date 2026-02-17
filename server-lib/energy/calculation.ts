/**
 * Cálculo de ahorro: ofertas activas, coste oferta, mejor oferta, validaciones.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceExtraction } from '../invoice/types.js';
import { normalizeCompanyName } from '../invoice/extract-fields.js';

export interface EnergyOffer {
  id: string;
  company_name: string;
  p1: number | null;
  p2: number | null;
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
/** Potencia contratada por defecto (kW) cuando no viene en factura, para calcular término potencia con P1/P2. */
const DEFAULT_POWER_KW = 4.6;
const DAYS_PER_MONTH = 30;

export async function getActiveOffers(supabase: SupabaseClient): Promise<EnergyOffer[]> {
  const { data, error } = await supabase
    .from('energy_offers')
    .select('id, company_name, p1, p2, price_per_kwh, monthly_fixed_cost, active')
    .eq('active', true);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    company_name: r.company_name,
    p1: r.p1 != null ? Number(r.p1) : null,
    p2: r.p2 != null ? Number(r.p2) : null,
    price_per_kwh: Number(r.price_per_kwh),
    monthly_fixed_cost: Number(r.monthly_fixed_cost),
    active: r.active,
  }));
}

/**
 * Coste mensual de una oferta para un consumo dado (kWh/mes).
 * - Término energía: consumo (kWh) × precio consumo (€/kWh).
 * - Término potencia: si la oferta tiene P1 y P2 (€/kW día), se usa potencia por defecto y 30 días;
 *   si no, se usa el coste fijo mensual (monthly_fixed_cost).
 */
export function monthlyCost(consumptionKwh: number, offer: EnergyOffer): number {
  const terminoEnergia = consumptionKwh * offer.price_per_kwh;
  const p1 = offer.p1 ?? null;
  const p2 = offer.p2 ?? null;
  const terminoPotencia =
    p1 != null && p2 != null
      ? DEFAULT_POWER_KW * DAYS_PER_MONTH * ((p1 + p2) / 2)
      : offer.monthly_fixed_cost;
  return terminoEnergia + terminoPotencia;
}

/**
 * Mensaje de error cuando la comparación no puede realizarse (para mostrar al usuario).
 */
export function getComparisonFailureReason(
  extraction: InvoiceExtraction,
  offers: EnergyOffer[]
): string {
  const consumption = extraction.consumption_kwh;
  const totalFactura = extraction.total_factura;
  const currentCompany = extraction.company_name ? normalizeCompanyName(extraction.company_name) : null;

  if (consumption == null || consumption <= 0 || totalFactura == null || totalFactura <= 0) {
    return 'No hemos podido leer todos los datos de esta factura de forma automática. Un asesor revisará tu factura y te contactará con una estimación personalizada.';
  }
  if (offers.length === 0) {
    return 'No hay ofertas configuradas para comparar.';
  }
  const comparable = offers.filter((o) => {
    const name = o.company_name.trim().toLowerCase();
    const current = (currentCompany || '').trim().toLowerCase();
    return name !== current;
  });
  if (comparable.length === 0) {
    return 'No hay otras comercializadoras con las que comparar.';
  }
  return 'No se encontró una oferta con ahorro con los datos extraídos.';
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
