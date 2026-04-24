export interface AiStatus {
  accountLogin: string;
  authenticated: boolean;
  available: boolean;
  message: string;
  modelCount: number;
  selectedModel: string;
}

export interface CsvAutoMapping {
  amount: string;
  currency: string | null;
  date: string;
  place: string;
}

export interface OcrExtractionResult {
  amount: number | null;
  currency: string | null;
  date: string | null;
  place: string | null;
  rawText: string;
}

const LOCAL_AI_BASE_URL = '';
const CENTRAL_AI_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_AI_CENTRAL_BASE_URL);
const REQUEST_TIMEOUT_MS = 12000;

interface ApiResponse {
  error?: string;
  message?: string;
  model?: string;
  ok: boolean;
  results?: unknown;
  status?: AiStatus;
}

interface CsvMapResponse extends ApiResponse {
  mapping?: unknown;
}

interface OcrResponse extends ApiResponse {
  results?: unknown;
}

function normalizeBaseUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

function buildAiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toStringOrNull(value: unknown): string | null {
  const text = toStringOrEmpty(value);
  return text.length > 0 ? text : null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^0-9.-]/g, '');
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeCsvAutoMapping(raw: unknown): CsvAutoMapping {
  if (!isRecord(raw)) {
    return {
      place: '',
      amount: '',
      date: '',
      currency: null,
    };
  }

  return {
    place: toStringOrEmpty(raw.place),
    amount: toStringOrEmpty(raw.amount),
    date: toStringOrEmpty(raw.date),
    currency: toStringOrNull(raw.currency),
  };
}

function normalizeOcrResult(raw: unknown): OcrExtractionResult {
  if (!isRecord(raw)) {
    return {
      place: null,
      amount: null,
      currency: null,
      date: null,
      rawText: '',
    };
  }

  return {
    place: toStringOrNull(raw.place),
    amount: toNumberOrNull(raw.amount),
    currency: toStringOrNull(raw.currency),
    date: toStringOrNull(raw.date),
    rawText: toStringOrEmpty(raw.rawText),
  };
}

function normalizeOcrResults(raw: unknown): OcrExtractionResult[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.map((item) => normalizeOcrResult(item));
}

async function readAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('file_reader_invalid_result'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('file_reader_error'));
    reader.readAsDataURL(file);
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      ...init,
      signal: controller.signal,
    });

    const payload = (await response.json()) as T;
    if (!response.ok) {
      throw new Error(`request_failed_${response.status}`);
    }

    return payload;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

async function requestAiWithFallback<T extends ApiResponse>(
  path: string,
  init?: RequestInit,
  isSuccessful?: (payload: T) => boolean,
): Promise<T> {
  const endpoints = [
    ...(CENTRAL_AI_BASE_URL ? [buildAiUrl(CENTRAL_AI_BASE_URL, path)] : []),
    buildAiUrl(LOCAL_AI_BASE_URL, path),
  ];

  let lastError: unknown = null;

  for (let index = 0; index < endpoints.length; index += 1) {
    const endpoint = endpoints[index];
    try {
      const payload = await requestJson<T>(endpoint, init);
      const success = isSuccessful ? isSuccessful(payload) : payload.ok;
      if (success) {
        return payload;
      }

      throw new Error(payload.message || payload.error || 'ai_request_failed');
    } catch (error) {
      lastError = error;
      if (index === endpoints.length - 1) {
        break;
      }
    }
  }

  throw new Error(asErrorMessage(lastError) || 'ai_request_failed');
}

export async function fetchAiStatus(): Promise<AiStatus> {
  const localStatusUrl = buildAiUrl(LOCAL_AI_BASE_URL, '/api/ai/status');

  if (CENTRAL_AI_BASE_URL) {
    try {
      const centralPayload = await requestJson<ApiResponse>(buildAiUrl(CENTRAL_AI_BASE_URL, '/api/ai/status'));
      if (
        centralPayload.ok &&
        centralPayload.status &&
        centralPayload.status.available &&
        centralPayload.status.authenticated
      ) {
        return centralPayload.status;
      }
    } catch {
      // fallback handled below
    }
  }

  const payload = await requestJson<ApiResponse>(localStatusUrl);
  if (!payload.ok || !payload.status) {
    throw new Error(payload.error || payload.message || 'ai_status_failed');
  }
  return payload.status;
}

export async function requestCsvAutoMapping(headers: string[], sampleRows: string[][]): Promise<CsvAutoMapping> {
  const payload = await requestAiWithFallback<CsvMapResponse>('/api/ai/csv-map', {
    body: JSON.stringify({ headers, sampleRows }),
    method: 'POST',
  });

  if (!payload.ok) {
    throw new Error(payload.message || payload.error || 'csv_map_failed');
  }

  return normalizeCsvAutoMapping(payload.mapping);
}

export async function requestOcrExtraction(files: File[]): Promise<OcrExtractionResult[]> {
  const images = await Promise.all(
    files.map(async (file) => ({
      dataUrl: await readAsDataUrl(file),
      name: file.name,
    })),
  );

  const payload = await requestAiWithFallback<OcrResponse>('/api/ai/ocr', {
    body: JSON.stringify({ images }),
    method: 'POST',
  });

  if (!payload.ok) {
    throw new Error(payload.message || payload.error || 'ocr_failed');
  }

  return normalizeOcrResults(payload.results);
}

