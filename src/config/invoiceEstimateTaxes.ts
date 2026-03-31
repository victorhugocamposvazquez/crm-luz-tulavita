/**
 * Coeficientes para la columna «≈ Factura» del simulador.
 * Fuente principal: tabla `invoice_estimate_settings` (backoffice).
 * Si falla la lectura o no hay fila, se usan variables VITE_* y por último defaults.
 */

export type InvoiceEstimateTaxConfig = {
  electricityTaxRate: number;
  vatRate: number;
  fixedChargesEurPerDay: number;
};

const DEFAULT_ELECTRICITY_TAX_RATE = 0.051126963;
const DEFAULT_VAT_RATE = 0.21;
const DEFAULT_FIXED_CHARGES_EUR_PER_DAY = 6.54 / 31;

function parseEnvRate(key: string, fallback: number): number {
  const raw = import.meta.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

function parseEnvFixedPerDay(key: string, fallback: number): number {
  const raw = import.meta.env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 50) return fallback;
  return n;
}

/** Fallback cuando no hay fila en BD o error de red (env + defaults). */
export function getFallbackInvoiceEstimateTaxConfig(): InvoiceEstimateTaxConfig {
  return {
    electricityTaxRate: parseEnvRate('VITE_INVOICE_ELECTRICITY_TAX_RATE', DEFAULT_ELECTRICITY_TAX_RATE),
    vatRate: parseEnvRate('VITE_INVOICE_VAT_RATE', DEFAULT_VAT_RATE),
    fixedChargesEurPerDay: parseEnvFixedPerDay('VITE_INVOICE_FIXED_CHARGES_EUR_PER_DAY', DEFAULT_FIXED_CHARGES_EUR_PER_DAY),
  };
}

export function rowToInvoiceEstimateTaxConfig(row: {
  electricity_tax_rate: number | string;
  vat_rate: number | string;
  fixed_charges_eur_per_day: number | string;
}): InvoiceEstimateTaxConfig {
  return {
    electricityTaxRate: Number(row.electricity_tax_rate),
    vatRate: Number(row.vat_rate),
    fixedChargesEurPerDay: Number(row.fixed_charges_eur_per_day),
  };
}

/**
 * Esquema tipo Excel: IE sobre (energía+potencia), cargos × días, IVA sobre la base.
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
