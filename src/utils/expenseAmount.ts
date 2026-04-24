import { Expense, NewExpenseInput } from '../types';

export type AppliedKrwSource = 'final' | 'estimated';

interface AppliedKrwAmount {
  amount: number;
  source: AppliedKrwSource;
}

type AmountSnapshot = Pick<
  Expense,
  'originalAmount' | 'originalCurrency' | 'estimatedKrwAmount' | 'exchangeRate' | 'krwAmount'
>;

type AmountInputSnapshot = Pick<
  NewExpenseInput,
  'originalAmount' | 'originalCurrency' | 'estimatedKrwAmount' | 'exchangeRate'
>;

function normalizeNonNegative(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function resolveEstimatedKrwFromInput(input: AmountInputSnapshot): number {
  const explicitEstimated = normalizeNonNegative(input.estimatedKrwAmount);
  if (explicitEstimated !== null) {
    return explicitEstimated;
  }

  if (input.originalCurrency === 'KRW') {
    return Math.max(0, input.originalAmount);
  }

  const rate = normalizeNonNegative(input.exchangeRate);
  if (rate !== null) {
    return Math.max(0, input.originalAmount * rate);
  }

  return 0;
}

export function getEstimatedKrwAmount(expense: AmountSnapshot): number {
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

export function getFinalKrwAmount(expense: Pick<Expense, 'finalKrwAmount'>): number | null {
  return normalizeNonNegative(expense.finalKrwAmount);
}

export function resolveAppliedKrwAmount(expense: AmountSnapshot & Pick<Expense, 'finalKrwAmount'>): AppliedKrwAmount {
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

export function resolveEffectiveExchangeRate(expense: AmountSnapshot): number {
  if (expense.originalCurrency === 'KRW') {
    return 1;
  }

  const directRate = normalizeNonNegative(expense.exchangeRate);
  if (directRate !== null && directRate > 0) {
    return directRate;
  }

  if (expense.originalAmount > 0) {
    const estimated = getEstimatedKrwAmount(expense);
    if (estimated > 0) {
      return estimated / expense.originalAmount;
    }
  }

  return 0;
}

export function convertKrwToOriginalAmount(expense: AmountSnapshot, krwAmount: number): number | null {
  if (!Number.isFinite(krwAmount) || krwAmount < 0) {
    return null;
  }

  if (expense.originalCurrency === 'KRW') {
    return krwAmount;
  }

  const rate = resolveEffectiveExchangeRate(expense);
  if (rate <= 0) {
    return null;
  }

  return krwAmount / rate;
}

export function getFinalEstimatedDiff(expense: AmountSnapshot & Pick<Expense, 'finalKrwAmount'>): number | null {
  const finalKrwAmount = getFinalKrwAmount(expense);
  if (finalKrwAmount === null) {
    return null;
  }
  return finalKrwAmount - getEstimatedKrwAmount(expense);
}
