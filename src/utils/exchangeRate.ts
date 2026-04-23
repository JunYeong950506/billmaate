import { CurrencyCode } from '../types';

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

const FREE_EXCHANGE_RATE_API = 'https://api.frankfurter.app/latest';

export async function fetchLatestRateToKrw(currency: CurrencyCode): Promise<number> {
  if (currency === 'KRW') {
    return 1;
  }

  const endpoint = `${FREE_EXCHANGE_RATE_API}?from=${currency}&to=KRW`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`rate_fetch_failed_${response.status}`);
  }

  const data = (await response.json()) as FrankfurterResponse;
  const rate = data.rates?.KRW;

  if (!Number.isFinite(rate) || !rate || rate <= 0) {
    throw new Error('rate_parse_failed');
  }

  return rate;
}
