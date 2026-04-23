import { getCopilotRuntime } from './copilotRuntime';
function sendJson(res, status, payload) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
}
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    return (text ? JSON.parse(text) : {});
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function isStringMatrix(value) {
    return Array.isArray(value) && value.every((row) => isStringArray(row));
}
function isValidOcrImages(value) {
    return (Array.isArray(value) &&
        value.every((item) => item &&
            typeof item === 'object' &&
            typeof item.name === 'string' &&
            typeof item.dataUrl === 'string'));
}
export function billmateAiPlugin() {
    const runtime = getCopilotRuntime();
    return {
        name: 'billmate-ai-runtime',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const pathname = (req.url || '').split('?')[0];
                if (req.method === 'GET' && pathname === '/api/ai/status') {
                    const status = await runtime.getStatus();
                    sendJson(res, 200, { ok: true, status });
                    return;
                }
                if (req.method === 'POST' && pathname === '/api/ai/csv-map') {
                    try {
                        const body = await readJsonBody(req);
                        const headers = isStringArray(body.headers) ? body.headers : [];
                        const sampleRows = isStringMatrix(body.sampleRows) ? body.sampleRows : [];
                        if (headers.length === 0) {
                            sendJson(res, 400, { ok: false, error: 'headers_required' });
                            return;
                        }
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
                        return;
                    }
                    catch (error) {
                        sendJson(res, 500, {
                            ok: false,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        return;
                    }
                }
                if (req.method === 'POST' && pathname === '/api/ai/ocr') {
                    try {
                        const body = await readJsonBody(req);
                        const images = isValidOcrImages(body.images) ? body.images : [];
                        if (images.length === 0) {
                            sendJson(res, 400, { ok: false, error: 'images_required' });
                            return;
                        }
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
                        return;
                    }
                    catch (error) {
                        sendJson(res, 500, {
                            ok: false,
                            error: error instanceof Error ? error.message : String(error),
                        });
                        return;
                    }
                }
                next();
            });
        },
    };
}
