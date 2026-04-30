import type { IncomingMessage, ServerResponse } from 'node:http';

import { getCopilotRuntime } from '../../server/copilotRuntime';
import { isStringArray, isStringMatrix, parseJsonBody, readRawBody, sendJson, tryProxyToCentral } from './_shared';

interface CsvMapRequestBody {
  headers?: string[];
  sampleRows?: string[][];
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const bodyText = await readRawBody(req);
  if (await tryProxyToCentral(req, res, '/api/ai/csv-map', bodyText)) {
    return;
  }

  try {
    const body = parseJsonBody<CsvMapRequestBody>(bodyText);
    const headers = isStringArray(body.headers) ? body.headers : [];
    const sampleRows = isStringMatrix(body.sampleRows) ? body.sampleRows : [];

    if (headers.length === 0) {
      sendJson(res, 400, { ok: false, error: 'headers_required' });
      return;
    }

    const runtime = getCopilotRuntime();
    const status = await runtime.getStatus();
    if (!status.available || !status.authenticated) {
      sendJson(res, 200, {
        ok: false,
        error: 'ai_unavailable',
        message: status.message,
      });
      return;
    }

    const mapped = await runtime.suggestCsvMapping(headers, sampleRows);
    sendJson(res, 200, {
      ok: true,
      mapping: mapped.mapping,
      model: mapped.model,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
