/**
 * Misma lógica que `src/config/invoiceEstimateTaxes.ts` para el servidor (process-invoice).
 * Coeficientes desde `invoice_estimate_settings` o env / defaults.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type InvoiceEstimateTaxConfig = {
  electricityTaxRate: number;
  vatRate: number;
  fixedChargesEurPerDay: number;
};

const DEFAULT_ELECTRICITY_TAX_RATE = 0.051126963;
const DEFAULT_VAT_RATE = 0.21;
const DEFAULT_FIXED_CHARGES_EUR_PER_DAY = 6.54 / 31;

function parseEnvRate(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

function parseEnvFixedPerDay(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 50) return fallback;
  return n;
}

/** Fallback: VITE_* (Vercel) o INVOICE_* o defaults de migración. */
export function getFallbackInvoiceEstimateTaxConfigFromEnv(): InvoiceEstimateTaxConfig {
  const ie =
    process.env.VITE_INVOICE_ELECTRICITY_TAX_RATE ??
    process.env.INVOICE_ELECTRICITY_TAX_RATE;
  const vat = process.env.VITE_INVOICE_VAT_RATE ?? process.env.INVOICE_VAT_RATE;
  const fixed =
    process.env.VITE_INVOICE_FIXED_CHARGES_EUR_PER_DAY ??
    process.env.INVOICE_FIXED_CHARGES_EUR_PER_DAY;
  return {
    electricityTaxRate: parseEnvRate(ie, DEFAULT_ELECTRICITY_TAX_RATE),
    vatRate: parseEnvRate(vat, DEFAULT_VAT_RATE),
    fixedChargesEurPerDay: parseEnvFixedPerDay(fixed, DEFAULT_FIXED_CHARGES_EUR_PER_DAY),
  };
}

/**
 * Esquema tipo Excel: IE sobre (energía+potencia), cargos × días, IVA sobre la base.
 * Debe coincidir con `estimateSpanishBillTotal` del front.
 */
export function estimateSpanishBillTotal(
  energyPlusPowerSubtotal: number,
  billingDays: number,
  config: InvoiceEstimateTaxConfig,
): number {
  const { electricityTaxRate, vatRate, fixedChargesEurPerDay } = config;
  const days = Math.max(1, billingDays);
  const varios = fixedChargesEurPerDay * days;
  const ie = electricityTaxRate * energyPlusPowerSubtotal;
  const baseIva = energyPlusPowerSubtotal + ie + varios;
  const iva = vatRate * baseIva;
  return Math.round((baseIva + iva) * 100) / 100;
}

export async function fetchInvoiceEstimateTaxConfig(
  supabase: SupabaseClient,
): Promise<InvoiceEstimateTaxConfig> {
  const { data, error } = await supabase
    .from('invoice_estimate_settings')
    .select('electricity_tax_rate, vat_rate, fixed_charges_eur_per_day')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return getFallbackInvoiceEstimateTaxConfigFromEnv();
  }

  return {
    electricityTaxRate: Number(data.electricity_tax_rate),
    vatRate: Number(data.vat_rate),
    fixedChargesEurPerDay: Number(data.fixed_charges_eur_per_day),
  };
}
