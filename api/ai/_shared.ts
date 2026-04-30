import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readRawBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString('utf8').trim();
}

export function parseJsonBody<T>(bodyText: string): T {
  return (bodyText ? JSON.parse(bodyText) : {}) as T;
}

export function getCentralAiBaseUrl(): string | null {
  const value = process.env.AI_CENTRAL_BASE_URL ?? process.env.VITE_AI_CENTRAL_BASE_URL;
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, '');
}

export async function tryProxyToCentral(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  bodyText?: string,
): Promise<boolean> {
  const baseUrl = getCentralAiBaseUrl();
  if (!baseUrl) {
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: req.method ?? (bodyText ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method === 'GET' ? undefined : bodyText,
    });

    const text = await response.text();
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json; charset=utf-8');
    res.end(text);
    return true;
  } catch {
    return false;
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isStringMatrix(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every((row) => isStringArray(row));
}
