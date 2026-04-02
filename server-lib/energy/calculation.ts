/**
 * Cálculo de ahorro: ofertas activas, coste oferta, mejor oferta, validaciones.
 * Alineado con `InvoiceSimulator` del CRM: mismas ofertas (tramos), filtro 2.0TD/3.0TD
 * y desglose energía/potencia por periodos cuando hay datos en la extracción.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceExtraction } from '../invoice/types.js';
import type { InvoiceEstimateTaxConfig } from './invoice-estimate-taxes.js';
import { estimateSpanishBillTotal } from './invoice-estimate-taxes.js';

export interface EnergyOffer {
  id: string;
  company_name: string;
  p1: number | null;
  p2: number | null;
  p3: number | null;
  p4: number | null;
  p5: number | null;
  p6: number | null;
  price_per_kwh: number;
  price_p1: number | null;
  price_p2: number | null;
  price_p3: number | null;
  price_p4: number | null;
  price_p5: number | null;
  price_p6: number | null;
  monthly_fixed_cost: number;
  active: boolean;
  tarifa_tipo: string;
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
const DEFAULT_POWER_KW = 4.6;
const FALLBACK_POWER_DAYS_PER_MONTH = 30;

function countBillingDaysInclusive(periodStart: string | null, periodEnd: string | null): number | null {
  if (!periodStart || !periodEnd) return null;
  try {
    const s = new Date(`${periodStart}T12:00:00`);
    const e = new Date(`${periodEnd}T12:00:00`);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime()) || e < s) return null;
    const days = Math.round((e.getTime() - s.getTime()) / (86400000)) + 1;
    if (days < 1 || days > 370) return null;
    return days;
  } catch {
    return null;
  }
}

function detectTarifaTipo(extraction: InvoiceExtraction): string {
  const t = (extraction.tipo_tarifa ?? '').toUpperCase().replace(/\s+/g, '');
  if (t.includes('3.0') || t.includes('30TD')) return '3.0TD';
  return '2.0TD';
}

function filterOffersByTarifa(offers: EnergyOffer[], tarifaTipo: string): EnergyOffer[] {
  const matched = offers.filter((o) => o.tarifa_tipo === tarifaTipo);
  return matched.length > 0 ? matched : offers;
}

/**
 * Misma lógica que `buildComparison` / `calcMonthlyCostBreakdown` en `InvoiceSimulator.tsx`.
 */
function calcMonthlyCostBreakdown(
  consumptionKwh: number,
  offer: EnergyOffer,
  powerKw: number | null,
  powersByPeriod: (number | null)[] | undefined,
  consumptionByPeriod: (number | null)[] | undefined,
  powerDaysPerBillMonth: number = FALLBACK_POWER_DAYS_PER_MONTH,
): { terminoEnergia: number; terminoPotencia: number; total: number } {
  const offerPrices = [offer.price_p1, offer.price_p2, offer.price_p3, offer.price_p4, offer.price_p5, offer.price_p6];
  const hasPeriodPrices = offerPrices.some((v) => v != null);

  let terminoEnergia: number;
  if (hasPeriodPrices && consumptionByPeriod && consumptionByPeriod.some((v) => v != null && v > 0)) {
    terminoEnergia = 0;
    for (let i = 0; i < 6; i++) {
      const cons = consumptionByPeriod[i] ?? 0;
      const price = offerPrices[i] ?? offer.price_per_kwh;
      terminoEnergia += cons * price;
    }
  } else {
    terminoEnergia = consumptionKwh * offer.price_per_kwh;
  }

  const offerPotPeriods = [offer.p1, offer.p2, offer.p3, offer.p4, offer.p5, offer.p6];
  const activePotPeriods = offerPotPeriods.filter((v) => v != null) as number[];

  if (activePotPeriods.length === 0) {
    const total = terminoEnergia + offer.monthly_fixed_cost;
    return { terminoEnergia, terminoPotencia: offer.monthly_fixed_cost, total };
  }

  let terminoPotencia = 0;
  if (powersByPeriod && powersByPeriod.length >= activePotPeriods.length) {
    for (let i = 0; i < activePotPeriods.length; i++) {
      const pw = powersByPeriod[i] ?? powerKw ?? DEFAULT_POWER_KW;
      terminoPotencia += pw * powerDaysPerBillMonth * activePotPeriods[i];
    }
  } else {
    const power = powerKw ?? DEFAULT_POWER_KW;
    for (const period of activePotPeriods) {
      terminoPotencia += power * powerDaysPerBillMonth * period;
    }
  }

  const total = terminoEnergia + terminoPotencia;
  return { terminoEnergia, terminoPotencia, total };
}

export async function getActiveOffers(supabase: SupabaseClient): Promise<EnergyOffer[]> {
  const { data, error } = await supabase
    .from('energy_offers')
    .select(
      'id, company_name, p1, p2, p3, p4, p5, p6, price_per_kwh, price_p1, price_p2, price_p3, price_p4, price_p5, price_p6, monthly_fixed_cost, active, tarifa_tipo',
    )
    .eq('active', true);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    company_name: r.company_name,
    p1: r.p1 != null ? Number(r.p1) : null,
    p2: r.p2 != null ? Number(r.p2) : null,
    p3: r.p3 != null ? Number(r.p3) : null,
    p4: r.p4 != null ? Number(r.p4) : null,
    p5: r.p5 != null ? Number(r.p5) : null,
    p6: r.p6 != null ? Number(r.p6) : null,
    price_per_kwh: Number(r.price_per_kwh),
    price_p1: r.price_p1 != null ? Number(r.price_p1) : null,
    price_p2: r.price_p2 != null ? Number(r.price_p2) : null,
    price_p3: r.price_p3 != null ? Number(r.price_p3) : null,
    price_p4: r.price_p4 != null ? Number(r.price_p4) : null,
    price_p5: r.price_p5 != null ? Number(r.price_p5) : null,
    price_p6: r.price_p6 != null ? Number(r.price_p6) : null,
    monthly_fixed_cost: Number(r.monthly_fixed_cost),
    active: r.active,
    tarifa_tipo: typeof r.tarifa_tipo === 'string' && r.tarifa_tipo.trim() ? r.tarifa_tipo : '2.0TD',
  }));
}

/**
 * Coste mensual base (energía + potencia), compatible con ofertas sin tramos en BD.
 */
export function monthlyCost(
  consumptionKwh: number,
  offer: EnergyOffer,
  powerKw?: number | null,
  powerDaysPerBillMonth: number = FALLBACK_POWER_DAYS_PER_MONTH,
): number {
  return calcMonthlyCostBreakdown(
    consumptionKwh,
    offer,
    powerKw ?? null,
    undefined,
    undefined,
    powerDaysPerBillMonth,
  ).total;
}

export function normalizeCompanyName(name: string): string {
  return name
    .replace(/,?\s*(S\.?L\.?U?\.?|S\.?A\.?|S\.?L\.?|S\.?Coop\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getComparisonFailureReason(
  extraction: InvoiceExtraction,
  offers: EnergyOffer[],
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
  const tariffOffers = filterOffersByTarifa(offers, detectTarifaTipo(extraction));
  const comparable = tariffOffers.filter((o) => {
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
 * @param taxConfig Coeficientes IE/IVA/cargos (misma capa que columna «≈ Factura» del simulador).
 */
export function runComparison(
  extraction: InvoiceExtraction,
  offers: EnergyOffer[],
  taxConfig: InvoiceEstimateTaxConfig,
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
  const billDays = countBillingDaysInclusive(extraction.period_start, extraction.period_end);
  const powerDaysPerBillMonth =
    billDays != null && billDays >= 28 ? billDays / periodMonths : FALLBACK_POWER_DAYS_PER_MONTH;
  const taxBillingDays =
    billDays != null && billDays >= 28 && billDays <= 370 ? billDays : FALLBACK_POWER_DAYS_PER_MONTH;

  const extractedPower =
    extraction.potencia_contratada_kw ??
    (extraction.potencia_p1_kw != null && extraction.potencia_p2_kw != null
      ? (extraction.potencia_p1_kw + extraction.potencia_p2_kw) / 2
      : null);

  const powersByPeriod: (number | null)[] = [
    extraction.potencia_p1_kw,
    extraction.potencia_p2_kw,
    extraction.potencia_p3_kw,
    extraction.potencia_p4_kw,
    extraction.potencia_p5_kw,
    extraction.potencia_p6_kw,
  ];

  const consumptionByPeriod: (number | null)[] = [
    extraction.consumo_p1_kwh,
    extraction.consumo_p2_kwh,
    extraction.consumo_p3_kwh,
    extraction.consumo_p4_kwh,
    extraction.consumo_p5_kwh,
    extraction.consumo_p6_kwh,
  ].map((v) => (v != null ? v / periodMonths : null));

  const tariffOffers = filterOffersByTarifa(offers, detectTarifaTipo(extraction));

  const comparable = tariffOffers.filter((o) => {
    const name = o.company_name.trim().toLowerCase();
    const current = (currentCompany || '').trim().toLowerCase();
    return name !== current;
  });

  if (comparable.length === 0) return null;

  const costFor = (o: EnergyOffer) =>
    calcMonthlyCostBreakdown(
      consumptionMonthly,
      o,
      extractedPower,
      powersByPeriod,
      consumptionByPeriod,
      powerDaysPerBillMonth,
    ).total;

  let best = comparable[0];
  let bestCost = costFor(best);
  for (let i = 1; i < comparable.length; i++) {
    const cost = costFor(comparable[i]);
    if (cost < bestCost) {
      bestCost = cost;
      best = comparable[i];
    }
  }

  const bestApproxBill = estimateSpanishBillTotal(bestCost, taxBillingDays, taxConfig);
  const savingsAmount = currentMonthlyCost - bestApproxBill;
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
