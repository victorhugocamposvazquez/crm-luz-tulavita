/**
 * Calculates commission based on exact sale amount matches
 * Returns 0 if the amount doesn't match any of the predefined values
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
 * Gets the commission percentage for display purposes
 * (calculated from the fixed commission amounts)
 */
export const getCommissionPercentage = (saleAmount: number): number => {
  const commission = calculateCommission(saleAmount);
  if (commission === 0 || saleAmount === 0) return 0;
  return (commission / saleAmount) * 100;
};