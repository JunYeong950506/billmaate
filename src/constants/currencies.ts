import { CurrencyCode } from '../types';

export type CurrencyRegion = '기본' | '북미' | '유럽' | '아시아' | '오세아니아' | '중동';

export interface CurrencyMeta {
  code: CurrencyCode;
  country: string;
  name: string;
  symbol: string;
  flag: string;
  region: CurrencyRegion;
}

export interface CurrencyGroup {
  region: CurrencyRegion;
  items: CurrencyMeta[];
}

export const SUPPORTED_CURRENCIES: CurrencyMeta[] = [
  { code: 'KRW', country: '대한민국', name: '한국 원', symbol: '₩', flag: '🇰🇷', region: '기본' },
  { code: 'USD', country: '미국', name: '미국 달러', symbol: '$', flag: '🇺🇸', region: '북미' },
  { code: 'CAD', country: '캐나다', name: '캐나다 달러', symbol: 'C$', flag: '🇨🇦', region: '북미' },
  { code: 'EUR', country: '유럽', name: '유럽 유로', symbol: '€', flag: '🇪🇺', region: '유럽' },
  { code: 'GBP', country: '영국', name: '영국 파운드', symbol: '£', flag: '🇬🇧', region: '유럽' },
  { code: 'CHF', country: '스위스', name: '스위스 프랑', symbol: 'CHF', flag: '🇨🇭', region: '유럽' },
  { code: 'JPY', country: '일본', name: '일본 엔', symbol: '¥', flag: '🇯🇵', region: '아시아' },
  { code: 'SGD', country: '싱가포르', name: '싱가포르 달러', symbol: 'S$', flag: '🇸🇬', region: '아시아' },
  { code: 'HKD', country: '홍콩', name: '홍콩 달러', symbol: 'HK$', flag: '🇭🇰', region: '아시아' },
  { code: 'CNY', country: '중국', name: '중국 위안', symbol: '¥', flag: '🇨🇳', region: '아시아' },
  { code: 'MYR', country: '말레이시아', name: '말레이시아 링깃', symbol: 'RM', flag: '🇲🇾', region: '아시아' },
  { code: 'PHP', country: '필리핀', name: '필리핀 페소', symbol: '₱', flag: '🇵🇭', region: '아시아' },
  { code: 'IDR', country: '인도네시아', name: '인도네시아 루피아', symbol: 'Rp', flag: '🇮🇩', region: '아시아' },
  { code: 'THB', country: '태국', name: '태국 바트', symbol: '฿', flag: '🇹🇭', region: '아시아' },
  { code: 'VND', country: '베트남', name: '베트남 동', symbol: '₫', flag: '🇻🇳', region: '아시아' },
  { code: 'TWD', country: '대만', name: '대만 달러', symbol: 'NT$', flag: '🇹🇼', region: '아시아' },
  { code: 'AUD', country: '호주', name: '호주 달러', symbol: 'A$', flag: '🇦🇺', region: '오세아니아' },
  { code: 'NZD', country: '뉴질랜드', name: '뉴질랜드 달러', symbol: 'NZ$', flag: '🇳🇿', region: '오세아니아' },
  { code: 'AED', country: '아랍에미리트', name: '디르함', symbol: 'AED', flag: '🇦🇪', region: '중동' },
];

const REGION_ORDER: CurrencyRegion[] = ['기본', '북미', '유럽', '아시아', '오세아니아', '중동'];

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

export function getCurrencyPickerGroups(options?: { includeKrw?: boolean }): CurrencyGroup[] {
  const includeKrw = options?.includeKrw ?? true;

  return REGION_ORDER.map((region) => {
    const items = SUPPORTED_CURRENCIES.filter((item) => {
      if (item.region !== region) {
        return false;
      }

      if (!includeKrw && item.code === 'KRW') {
        return false;
      }

      return true;
    });

    return {
      region,
      items,
    };
  }).filter((group) => group.items.length > 0);
}

