import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function fileExists(targetPath) {
    try {
        await fs.access(targetPath, fsConstants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function patchInstalledCopilotSdk(projectRoot) {
    const targets = [
        path.join(projectRoot, 'node_modules', '@github', 'copilot-sdk', 'dist', 'session.js'),
        path.join(projectRoot, 'node_modules', '@github', 'copilot-sdk', 'dist', 'session.d.ts'),
    ];
    for (const target of targets) {
        if (!(await fileExists(target))) {
            continue;
        }
        const before = await fs.readFile(target, 'utf8');
        const after = before.replace(/(["'])vscode-jsonrpc\/node\1/g, '$1vscode-jsonrpc/node.js$1');
        if (after !== before) {
            await fs.writeFile(target, after, 'utf8');
        }
    }
}
async function loadCopilotSdkModule(projectRoot) {
    const sdkPath = path.join(projectRoot, 'node_modules', '@github', 'copilot-sdk', 'dist', 'index.js');
    if (!(await fileExists(sdkPath))) {
        throw new Error(`Copilot SDK not found: ${sdkPath}`);
    }
    return (await import(pathToFileURL(sdkPath).href));
}
function extractResponseText(value) {
    if (typeof value === 'string') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => extractResponseText(entry)).join('\n').trim();
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    const record = value;
    if (typeof record.text === 'string') {
        return record.text;
    }
    if (typeof record.content === 'string') {
        return record.content;
    }
    if (record.data) {
        return extractResponseText(record.data);
    }
    if (Array.isArray(record.content)) {
        return extractResponseText(record.content);
    }
    return '';
}
function parseFirstJsonObject(text) {
    const source = String(text || '').trim();
    try {
        return JSON.parse(source);
    }
    catch {
        // continue to bracket-scan
    }
    let depth = 0;
    let start = -1;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') {
            if (depth === 0) {
                start = index;
            }
            depth += 1;
            continue;
        }
        if (char === '}') {
            depth -= 1;
            if (depth === 0 && start >= 0) {
                const candidate = source.slice(start, index + 1);
                try {
                    return JSON.parse(candidate);
                }
                catch {
                    start = -1;
                }
            }
        }
    }
    return null;
}
function readString(value) {
    return typeof value === 'string' ? value : '';
}
function readNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function randomHex(byteLength) {
    return randomBytes(byteLength).toString('hex');
}
function getProviderRank(model) {
    const text = `${model.id} ${model.name}`.toLowerCase();
    if (/\b(gpt|o[134]|openai)\b/.test(text)) {
        return 0;
    }
    if (text.includes('gemini')) {
        return 1;
    }
    if (text.includes('claude')) {
        return 2;
    }
    return 3;
}
function getVersionScore(model) {
    const text = `${model.id} ${model.name}`.toLowerCase();
    const regex = /\d+(?:\.\d+)?/g;
    const numbers = [];
    let matched = regex.exec(text);
    while (matched) {
        numbers.push(Number(matched[0]));
        matched = regex.exec(text);
    }
    return numbers.reduce((score, value, index) => score + value / Math.pow(100, index), 0);
}
function chooseAutomaticModel(models) {
    const items = models.filter((model) => model.id);
    if (items.length === 0) {
        return 'gpt-4.1';
    }
    const freeItems = items.filter((model) => Number(model.multiplier) === 0);
    const basePool = freeItems.length > 0 ? freeItems : items;
    const openAiPool = basePool.filter((model) => /\b(gpt|o[134]|openai)\b/i.test(`${model.id} ${model.name}`));
    const rankedPool = openAiPool.length > 0 ? openAiPool : basePool;
    const sorted = [...rankedPool].sort((a, b) => {
        const providerDiff = getProviderRank(a) - getProviderRank(b);
        if (providerDiff !== 0) {
            return providerDiff;
        }
        return getVersionScore(b) - getVersionScore(a);
    });
    return sorted[0]?.id || items[0]?.id || 'gpt-4.1';
}
function dataUrlToTempFileName(imageName, mimeType) {
    const safeName = path
        .parse(imageName || 'image')
        .name.replace(/[^a-zA-Z0-9_-]+/g, '-')
        .slice(0, 24) || 'image';
    const extension = mimeType.includes('png')
        ? 'png'
        : mimeType.includes('webp')
            ? 'webp'
            : mimeType.includes('gif')
                ? 'gif'
                : 'jpg';
    return `billmate-${safeName}-${randomHex(4)}.${extension}`;
}
async function dataUrlToTempFile(image) {
    const matched = String(image.dataUrl || '').match(/^data:(.+?);base64,(.+)$/);
    if (!matched) {
        throw new Error('invalid_image_data_url');
    }
    const [, mimeType, base64] = matched;
    const buffer = Buffer.from(base64, 'base64');
    const tempPath = path.join(os.tmpdir(), dataUrlToTempFileName(image.name, mimeType));
    await fs.writeFile(tempPath, buffer);
    return tempPath;
}
function normalizeOcrPayload(parsed, rawText) {
    if (!parsed) {
        return {
            amount: null,
            currency: null,
            date: null,
            place: null,
            rawText,
        };
    }
    return {
        amount: typeof parsed.amount === 'number' && Number.isFinite(parsed.amount) ? parsed.amount : null,
        currency: typeof parsed.currency === 'string' ? parsed.currency.trim().toUpperCase() : null,
        date: typeof parsed.date === 'string' ? parsed.date.trim() : null,
        place: typeof parsed.place === 'string' ? parsed.place.trim() : null,
        rawText,
    };
}
function normalizeCsvMapping(parsed, headers) {
    const headerSet = new Set(headers);
    const place = readString(parsed?.place).trim();
    const amount = readString(parsed?.amount).trim();
    const date = readString(parsed?.date).trim();
    const currency = readString(parsed?.currency).trim();
    const fallback = {
        place: headers.find((header) => /place|가맹|상호|사용처|매장/i.test(header)) || '',
        amount: headers.find((header) => /amount|금액|결제금액|승인금액/i.test(header)) || '',
        date: headers.find((header) => /date|일자|날짜|결제일|거래일/i.test(header)) || '',
        currency: headers.find((header) => /currency|통화|화폐/i.test(header)) || null,
    };
    return {
        place: headerSet.has(place) ? place : fallback.place,
        amount: headerSet.has(amount) ? amount : fallback.amount,
        date: headerSet.has(date) ? date : fallback.date,
        currency: currency && headerSet.has(currency) ? currency : fallback.currency,
    };
}
class CopilotRuntime {
    constructor() {
        this.approveAll = null;
        this.client = null;
        this.initialized = false;
        this.modelCache = null;
    }
    async ensureClient() {
        if (this.client) {
            return;
        }
        const projectRoot = process.cwd();
        if (!this.initialized) {
            await patchInstalledCopilotSdk(projectRoot);
            this.initialized = true;
        }
        const sdk = await loadCopilotSdkModule(projectRoot);
        this.client = new sdk.CopilotClient({
            cwd: process.cwd(),
            env: {
                ...process.env,
                NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS ?? '1',
            },
            logLevel: 'error',
            useLoggedInUser: true,
        });
        if (typeof this.client.start === 'function') {
            await this.client.start();
        }
        this.approveAll = sdk.approveAll ?? null;
    }
    async listModels() {
        await this.ensureClient();
        if (!this.client || typeof this.client.listModels !== 'function') {
            return [];
        }
        const rawModels = await this.client.listModels();
        const models = Array.isArray(rawModels)
            ? rawModels
                .map((model) => ({
                id: readString(model?.id),
                multiplier: readNumber(model?.billing?.multiplier),
                name: readString(model?.name),
            }))
                .filter((model) => model.id)
            : [];
        this.modelCache = models;
        return models;
    }
    async getStatus() {
        try {
            await this.ensureClient();
            const auth = this.client && typeof this.client.getAuthStatus === 'function' ? await this.client.getAuthStatus() : {};
            const models = await this.listModels();
            const selectedModel = chooseAutomaticModel(models);
            const authenticated = auth?.isAuthenticated === true && readString(auth?.login).length > 0;
            return {
                accountLogin: readString(auth?.login),
                authenticated,
                available: true,
                message: authenticated
                    ? `Copilot connected. Auto model: ${selectedModel}`
                    : 'Copilot login required. Run `copilot login` in terminal.',
                modelCount: models.length,
                selectedModel,
            };
        }
        catch (error) {
            return {
                accountLogin: '',
                authenticated: false,
                available: false,
                message: error instanceof Error ? error.message : String(error),
                modelCount: 0,
                selectedModel: '',
            };
        }
    }
    async invoke(prompt, attachmentPaths = []) {
        await this.ensureClient();
        const models = this.modelCache ?? (await this.listModels());
        const selectedModel = chooseAutomaticModel(models);
        let session = null;
        try {
            session = await this.client.createSession({
                availableTools: [],
                model: selectedModel,
                onPermissionRequest: this.approveAll,
                sessionId: `billmate-${randomHex(4)}`,
                streaming: true,
                workingDirectory: process.cwd(),
            });
            const messageOptions = { prompt };
            if (attachmentPaths.length > 0) {
                messageOptions.attachments = attachmentPaths.map((filePath) => ({ path: filePath, type: 'file' }));
            }
            const response = await session.sendAndWait(messageOptions, 90000);
            return {
                model: selectedModel,
                text: extractResponseText(response),
            };
        }
        finally {
            if (session && typeof session.disconnect === 'function') {
                await session.disconnect().catch(() => undefined);
            }
        }
    }
    async suggestCsvMapping(headers, sampleRows) {
        const prompt = [
            'You map CSV columns for a travel expense app.',
            'Return ONLY JSON object with keys: place, amount, currency, date.',
            'Values must be exact header names from provided headers. currency can be null.',
            `headers: ${JSON.stringify(headers)}`,
            `sample_rows: ${JSON.stringify(sampleRows.slice(0, 3))}`,
        ].join('\n');
        const result = await this.invoke(prompt);
        const parsed = parseFirstJsonObject(result.text);
        return {
            mapping: normalizeCsvMapping(parsed, headers),
            model: result.model,
            rawText: result.text,
        };
    }
    async extractOcr(images) {
        const results = [];
        let model = '';
        for (const image of images) {
            const tempFilePath = await dataUrlToTempFile(image);
            try {
                const prompt = [
                    'Extract receipt fields for travel expense logging.',
                    'Return ONLY JSON object:',
                    '{"place": string|null, "amount": number|null, "currency": "KRW|JPY|CNY|TWD|USD|EUR|GBP|AED|AUD|HKD|SGD|THB|VND"|null, "date": "YYYY-MM-DD"|null}',
                    'Rules: amount is number only; use null when unknown.',
                ].join('\n');
                const response = await this.invoke(prompt, [tempFilePath]);
                model = response.model;
                const parsed = parseFirstJsonObject(response.text);
                results.push(normalizeOcrPayload(parsed, response.text));
            }
            finally {
                await fs.unlink(tempFilePath).catch(() => undefined);
            }
        }
        return {
            model,
            results,
        };
    }
}
let runtimeSingleton = null;
export function getCopilotRuntime() {
    if (!runtimeSingleton) {
        runtimeSingleton = new CopilotRuntime();
    }
    return runtimeSingleton;
}
