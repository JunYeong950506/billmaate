import { CurrencyCode } from '../types';

export interface CurrencyMeta {
  code: CurrencyCode;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'KRW', name: '한국 원', symbol: 'KRW' },
  { code: 'JPY', name: '일본 엔', symbol: 'JPY' },
  { code: 'CNY', name: '중국 위안', symbol: 'CNY' },
  { code: 'TWD', name: '대만 달러', symbol: 'NT$' },
  { code: 'USD', name: '미국 달러', symbol: '$' },
  { code: 'EUR', name: '유로', symbol: 'EUR' },
  { code: 'GBP', name: '영국 파운드', symbol: 'GBP' },
  { code: 'AED', name: '아랍에미리트 디르함', symbol: 'AED' },
  { code: 'AUD', name: '호주 달러', symbol: 'A$' },
  { code: 'HKD', name: '홍콩 달러', symbol: 'HK$' },
  { code: 'SGD', name: '싱가포르 달러', symbol: 'S$' },
  { code: 'THB', name: '태국 바트', symbol: 'THB' },
  { code: 'VND', name: '베트남 동', symbol: 'VND' },
];

export function getCurrencyMeta(code: CurrencyCode): CurrencyMeta {
  const found = SUPPORTED_CURRENCIES.find((item) => item.code === code);
  return found ?? SUPPORTED_CURRENCIES[0];
}

export function getOrderedCurrencies(defaultCurrency: CurrencyCode): CurrencyMeta[] {
  const remainder = SUPPORTED_CURRENCIES.filter((item) => item.code !== defaultCurrency && item.code !== 'KRW');

  if (defaultCurrency === 'KRW') {
    return [getCurrencyMeta('KRW'), ...remainder];
  }

  return [getCurrencyMeta(defaultCurrency), getCurrencyMeta('KRW'), ...remainder];
}
