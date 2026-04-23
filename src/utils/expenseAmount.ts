import { Expense } from '../types';

export type AppliedKrwSource = 'final' | 'estimated';

interface AppliedKrwAmount {
  amount: number;
  source: AppliedKrwSource;
}

function normalizeNonNegative(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function getEstimatedKrwAmount(expense: Expense): number {
  const estimated = normalizeNonNegative(expense.estimatedKrwAmount);
  if (estimated !== null) {
    return estimated;
  }

  const legacy = normalizeNonNegative(expense.krwAmount);
  if (legacy !== null) {
    return legacy;
  }

  if (expense.originalCurrency === 'KRW') {
    return Math.max(0, expense.originalAmount);
  }

  const rate = normalizeNonNegative(expense.exchangeRate);
  if (rate !== null) {
    return Math.max(0, expense.originalAmount * rate);
  }

  return 0;
}

export function getFinalKrwAmount(expense: Expense): number | null {
  return normalizeNonNegative(expense.finalKrwAmount);
}

export function resolveAppliedKrwAmount(expense: Expense): AppliedKrwAmount {
  const finalKrwAmount = getFinalKrwAmount(expense);
  if (finalKrwAmount !== null) {
    return {
      amount: finalKrwAmount,
      source: 'final',
    };
  }

  return {
    amount: getEstimatedKrwAmount(expense),
    source: 'estimated',
  };
}

export function getFinalEstimatedDiff(expense: Expense): number | null {
  const finalKrwAmount = getFinalKrwAmount(expense);
  if (finalKrwAmount === null) {
    return null;
  }
  return finalKrwAmount - getEstimatedKrwAmount(expense);
}
