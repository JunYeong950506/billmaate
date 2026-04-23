export interface AiRuntimeStatus {
    accountLogin: string;
    authenticated: boolean;
    available: boolean;
    message: string;
    modelCount: number;
    selectedModel: string;
}
export interface OcrImageInput {
    dataUrl: string;
    name: string;
}
interface OcrExtraction {
    amount: number | null;
    currency: string | null;
    date: string | null;
    place: string | null;
    rawText: string;
}
interface CsvMapping {
    amount: string;
    currency: string | null;
    date: string;
    place: string;
}
declare class CopilotRuntime {
    private approveAll;
    private client;
    private initialized;
    private modelCache;
    private ensureClient;
    private listModels;
    getStatus(): Promise<AiRuntimeStatus>;
    private invoke;
    suggestCsvMapping(headers: string[], sampleRows: string[][]): Promise<{
        mapping: CsvMapping;
        model: string;
        rawText: string;
    }>;
    extractOcr(images: OcrImageInput[]): Promise<{
        model: string;
        results: OcrExtraction[];
    }>;
}
export declare function getCopilotRuntime(): CopilotRuntime;
export {};
