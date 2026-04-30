import type { IncomingMessage, ServerResponse } from 'node:http';

import { getCopilotRuntime, OcrImageInput } from '../../server/copilotRuntime';
import { parseJsonBody, readRawBody, sendJson, tryProxyToCentral } from './_shared';

interface OcrRequestBody {
  images?: OcrImageInput[];
}

function isValidOcrImages(value: unknown): value is OcrImageInput[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item &&
        typeof item === 'object' &&
        typeof (item as OcrImageInput).name === 'string' &&
        typeof (item as OcrImageInput).dataUrl === 'string',
    )
  );
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  const bodyText = await readRawBody(req);
  if (await tryProxyToCentral(req, res, '/api/ai/ocr', bodyText)) {
    return;
  }

  try {
    const body = parseJsonBody<OcrRequestBody>(bodyText);
    const images = isValidOcrImages(body.images) ? body.images : [];

    if (images.length === 0) {
      sendJson(res, 400, { ok: false, error: 'images_required' });
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

    const extracted = await runtime.extractOcr(images);
    sendJson(res, 200, {
      ok: true,
      model: extracted.model,
      results: extracted.results,
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
