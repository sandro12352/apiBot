import {
    AIProvider,
    AIProviderError,
    type AIErrorKind,
    type AIModel,
    type GenerateParams,
    type GenerateResult,
} from "../../config/adapters/ai-provider";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const LIST_TIMEOUT_MS = 10_000;
const GENERATE_TIMEOUT_MS = 30_000;
const MAX_MODEL_PAGES = 3;

// Los ids de modelo van en la ruta de la URL: solo caracteres seguros
const MODEL_ID = /^[A-Za-z0-9._-]{1,100}$/;

interface GeminiErrorBody {
    error?: {
        code?: number;
        status?: string;
        details?: { reason?: string; violations?: { quotaId?: string }[] }[];
    };
}

// Traduce el error de Gemini a uno normalizado. Nota: una clave inválida llega como HTTP 400
// con reason API_KEY_INVALID, no como 401.
const classify = (httpStatus: number, body: GeminiErrorBody): AIErrorKind => {
    const status = body.error?.status;
    const details = body.error?.details ?? [];

    if (details.some((detail) => detail.reason === "API_KEY_INVALID")) return "auth";
    if (httpStatus === 401 || httpStatus === 403 || status === "UNAUTHENTICATED" || status === "PERMISSION_DENIED") {
        return "auth";
    }
    // 402 = saldo agotado; FAILED_PRECONDITION = facturación no habilitada
    if (httpStatus === 402 || status === "FAILED_PRECONDITION") return "quota";
    if (httpStatus === 429) {
        // Cuota diaria agotada no se arregla esperando; el límite por minuto sí
        const daily = details.some((detail) =>
            detail.violations?.some((violation) => /PerDay|Daily/i.test(violation.quotaId ?? "")),
        );
        return daily ? "quota" : "rate_limit";
    }
    if (httpStatus === 400 || httpStatus === 404) return "invalid_request";
    return "unavailable";
};

export class GeminiProvider extends AIProvider {
    readonly name = "GEMINI" as const;

    async listModels(apiKey: string): Promise<AIModel[]> {
        const models: AIModel[] = [];
        let pageToken: string | undefined;

        for (let page = 0; page < MAX_MODEL_PAGES; page++) {
            const query = new URLSearchParams({ pageSize: "1000", ...(pageToken ? { pageToken } : {}) });
            const data = (await this.request(`${BASE_URL}/models?${query}`, { method: "GET" }, apiKey, LIST_TIMEOUT_MS)) as {
                models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
                nextPageToken?: string;
            };

            for (const model of data.models ?? []) {
                const id = model.name?.replace(/^models\//, "");
                // Solo modelos de texto Gemini que sirven para generar respuestas
                if (!id || !id.startsWith("gemini") || !model.supportedGenerationMethods?.includes("generateContent")) continue;
                models.push({ id, ...(model.displayName ? { displayName: model.displayName } : {}) });
            }

            pageToken = data.nextPageToken;
            if (!pageToken) break;
        }

        return models;
    }

    async generate(params: GenerateParams): Promise<GenerateResult> {
        if (!MODEL_ID.test(params.model)) throw new AIProviderError("invalid_request");

        const data = (await this.request(
            `${BASE_URL}/models/${params.model}:generateContent`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: params.systemPrompt }] },
                    contents: params.messages.map((message) => ({
                        role: message.role === "assistant" ? "model" : "user",
                        parts: [{ text: message.content }],
                    })),
                    generationConfig: { maxOutputTokens: params.maxOutputTokens, temperature: 0.4 },
                }),
            },
            params.apiKey,
            GENERATE_TIMEOUT_MS,
        )) as {
            candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
            promptFeedback?: { blockReason?: string };
            usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
        };

        if (data.promptFeedback?.blockReason) throw new AIProviderError("blocked");

        const candidate = data.candidates?.[0];
        const text = (candidate?.content?.parts ?? [])
            // Las partes de razonamiento interno no se envían al cliente
            .filter((part) => !part.thought)
            .map((part) => part.text ?? "")
            .join("")
            .trim();

        if (!text) {
            const reason = candidate?.finishReason ?? "";
            throw new AIProviderError(reason && !["STOP", "MAX_TOKENS"].includes(reason) ? "blocked" : "empty");
        }

        const usage = data.usageMetadata;
        const output = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0);
        return {
            text,
            ...(usage?.promptTokenCount !== undefined ? { inputTokens: usage.promptTokenCount } : {}),
            ...(usage ? { outputTokens: output } : {}),
        };
    }

    // La clave va en cabecera, nunca en la URL (las URL acaban en logs)
    private async request(url: string, init: RequestInit, apiKey: string, timeoutMs: number): Promise<unknown> {
        let response: Response;
        try {
            response = await fetch(url, {
                ...init,
                headers: { ...(init.headers as Record<string, string> | undefined), "x-goog-api-key": apiKey },
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch {
            throw new AIProviderError("unavailable");
        }

        const body = (await response.json().catch(() => ({}))) as GeminiErrorBody;
        if (!response.ok) throw new AIProviderError(classify(response.status, body), response.status);
        return body;
    }
}
