import type { IncomingMessage, ServerResponse } from 'node:http';

import { getCopilotRuntime } from '../../server/copilotRuntime';
import { sendJson, tryProxyToCentral } from './_shared';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  if (await tryProxyToCentral(req, res, '/api/ai/status')) {
    return;
  }

  const status = await getCopilotRuntime().getStatus();
  sendJson(res, 200, { ok: true, status });
}
