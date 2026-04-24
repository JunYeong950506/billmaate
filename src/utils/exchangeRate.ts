import { CurrencyCode } from '../types';

interface FrankfurterResponse {
  rates?: Record<string, number>;
}

interface OpenErApiResponse {
  result?: string;
  rates?: Record<string, number>;
}

const FRANKFURTER_API = 'https://api.frankfurter.app/latest';
const OPEN_ER_API = 'https://open.er-api.com/v6/latest';

function parseKrwRate(rawRate: number | undefined): number {
  if (!Number.isFinite(rawRate) || !rawRate || rawRate <= 0) {
    throw new Error('rate_parse_failed');
  }

  return rawRate;
}

async function fetchRateFromFrankfurter(currency: CurrencyCode): Promise<number> {
  const endpoint = `${FRANKFURTER_API}?from=${currency}&to=KRW`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`frankfurter_fetch_failed_${response.status}`);
  }

  const data = (await response.json()) as FrankfurterResponse;
  return parseKrwRate(data.rates?.KRW);
}

async function fetchRateFromOpenErApi(currency: CurrencyCode): Promise<number> {
  const endpoint = `${OPEN_ER_API}/${currency}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`open_er_api_fetch_failed_${response.status}`);
  }

  const data = (await response.json()) as OpenErApiResponse;

  if (data.result && data.result !== 'success') {
    throw new Error(`open_er_api_result_${data.result}`);
  }

  return parseKrwRate(data.rates?.KRW);
}

export async function fetchLatestRateToKrw(currency: CurrencyCode): Promise<number> {
  if (currency === 'KRW') {
    return 1;
  }

  try {
    return await fetchRateFromOpenErApi(currency);
  } catch {
    return fetchRateFromFrankfurter(currency);
  }
}

