/**
 * Calculates commission based on exact sale amount matches
 * Returns 0 if the amount doesn't match any of the predefined values
 * Note: This calculation should exclude sale lines marked as "nulo" (null)
 */
export const calculateCommission = (saleAmount: number): number => {
  const commissionTable: Record<number, number> = {
    1000: 50,
    2500: 400,
    3000: 600,
    3500: 800,
    5000: 1000,
    5990: 1200
  };

  return commissionTable[saleAmount] || 0;
};

/**
 * Calculates the total amount from sale lines excluding those marked as "nulo"
 */
export const calculateTotalExcludingNulls = (saleLines: Array<{ quantity: number; unit_price: number; nulo: boolean }>): number => {
  return saleLines
    .filter(line => !line.nulo)
    .reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
};

/**
 * Calculates the effective amount for commission calculation excluding null lines
 * If sale_lines are not available, falls back to the sale amount
 */
export const calculateEffectiveAmount = (
  sale: { 
    amount: number; 
    sale_lines?: Array<{ quantity: number; unit_price: number; nulo: boolean }> 
  }
): number => {
  if (sale.sale_lines && sale.sale_lines.length > 0) {
    return calculateTotalExcludingNulls(sale.sale_lines);
  }
  return sale.amount;
};

/**
 * Calculates commission for a sale considering only non-null lines
 * If hasSecondCommercial is true, divides the commission by 2
 */
export const calculateSaleCommission = (
  sale: { 
    amount: number; 
    commission_amount?: number;
    sale_lines?: Array<{ quantity: number; unit_price: number; nulo: boolean }> 
  },
  hasSecondCommercial: boolean = false
): number => {
  if (sale.commission_amount) {
    return hasSecondCommercial ? sale.commission_amount / 2 : sale.commission_amount;
  }
  
  const effectiveAmount = calculateEffectiveAmount(sale);
  const baseCommission = calculateCommission(effectiveAmount);
  return hasSecondCommercial ? baseCommission / 2 : baseCommission;
};

/**
 * Gets the commission percentage for display purposes
 * (calculated from the fixed commission amounts)
 */
export const getCommissionPercentage = (saleAmount: number): number => {
  const commission = calculateCommission(saleAmount);
  if (commission === 0 || saleAmount === 0) return 0;
  return (commission / saleAmount) * 100;
};