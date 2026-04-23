import { CurrencyCode } from '../types';
import { getCurrencyMeta } from '../constants/currencies';

const twoDecimalFormatter = new Intl.NumberFormat('ko-KR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatKrw(value: number): string {
  return `${twoDecimalFormatter.format(value)}원`;
}

export function formatNumber2(value: number): string {
  return twoDecimalFormatter.format(value);
}

export function formatDateRange(startDate: string, endDate: string): string {
  if (!startDate || !endDate) {
    return '-';
  }
  return `${startDate} ~ ${endDate}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatOriginalAmount(amount: number, currency: CurrencyCode): string {
  const symbol = getCurrencyMeta(currency).symbol;
  return `${symbol}${twoDecimalFormatter.format(amount)}`;
}

export function clampToNonNegativeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
