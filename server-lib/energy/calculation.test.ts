import { describe, expect, it } from 'vitest';
import { getComparisonFailureReason, runComparison, type EnergyOffer } from './calculation.js';
import { emptyExtraction, type InvoiceExtraction } from '../invoice/types.js';
import type { InvoiceEstimateTaxConfig } from './invoice-estimate-taxes.js';

const TAX_CONFIG: InvoiceEstimateTaxConfig = {
  electricityTaxRate: 0.051126963,
  vatRate: 0.21,
  fixedChargesEurPerDay: 6.54 / 31,
};

function makeOffer(overrides: Partial<EnergyOffer> = {}): EnergyOffer {
  return {
    id: 'offer-1',
    company_name: 'Comercializadora Barata',
    p1: 0.08,
    p2: 0.08,
    p3: null,
    p4: null,
    p5: null,
    p6: null,
    price_per_kwh: 0.10,
    price_p1: 0.10,
    price_p2: 0.09,
    price_p3: null,
    price_p4: null,
    price_p5: null,
    price_p6: null,
    monthly_fixed_cost: 0,
    active: true,
    tarifa_tipo: '2.0TD',
    ...overrides,
  };
}

function makeExtraction(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    ...emptyExtraction(),
    company_name: 'Endesa',
    consumption_kwh: 300,
    total_factura: 95,
    period_months: 1,
    potencia_contratada_kw: 4.6,
    tipo_tarifa: '2.0TD',
    confidence: 0.9,
    ...overrides,
  };
}

describe('runComparison — umbral mínimo de confianza', () => {
  it('genera comparación con confianza alta', () => {
    const result = runComparison(makeExtraction(), [makeOffer()], TAX_CONFIG);
    expect(result).not.toBeNull();
  });

  it('bloquea la comparación con confianza por debajo del suelo', () => {
    const result = runComparison(makeExtraction({ confidence: 0.3 }), [makeOffer()], TAX_CONFIG);
    expect(result).toBeNull();
  });

  it('no bloquea extracciones manuales sin confianza calculada (confidence = 0)', () => {
    const result = runComparison(makeExtraction({ confidence: 0 }), [makeOffer()], TAX_CONFIG);
    expect(result).not.toBeNull();
  });
});

describe('getComparisonFailureReason — motivos diferenciados', () => {
  it('explica la baja confianza cuando los datos existen pero no son fiables', () => {
    const reason = getComparisonFailureReason(makeExtraction({ confidence: 0.3 }), [makeOffer()]);
    expect(reason).toContain('no es lo bastante fiable');
  });

  it('explica la falta de datos cuando no hay consumo/total', () => {
    const reason = getComparisonFailureReason(
      makeExtraction({ consumption_kwh: null, confidence: 0.3 }),
      [makeOffer()],
    );
    expect(reason).toContain('No hemos podido leer');
  });
});
