import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIProviderError } from "../src/config/adapters/ai-provider";
import { GeminiProvider } from "../src/infrastructure/ai/gemini.provider";

// Adaptador de Gemini con fetch simulado: formato de la petición, lectura de la respuesta y
// normalización de errores. Nunca se llama a Google.

const KEY = "AIzaSy-clave-secreta-0123456789";
const provider = new GeminiProvider();

let fetchMock: ReturnType<typeof vi.fn>;

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const generateParams = {
    apiKey: KEY,
    model: "gemini-test-model",
    systemPrompt: "Eres un asistente",
    messages: [
        { role: "user" as const, content: "hola" },
        { role: "assistant" as const, content: "¿en qué ayudo?" },
        { role: "user" as const, content: "precio" },
    ],
    maxOutputTokens: 500,
};

describe("listModels", () => {
    it("envía la clave en cabecera (no en la URL) y deja solo los modelos de texto Gemini", async () => {
        fetchMock.mockResolvedValueOnce(
            reply(200, {
                models: [
                    { name: "models/gemini-a", displayName: "Gemini A", supportedGenerationMethods: ["generateContent"] },
                    { name: "models/gemini-embed", supportedGenerationMethods: ["embedContent"] },
                    { name: "models/otro-modelo", supportedGenerationMethods: ["generateContent"] },
                    { name: "models/gemini-b", supportedGenerationMethods: ["generateContent", "countTokens"] },
                ],
            }),
        );

        const models = await provider.listModels(KEY);

        expect(models).toEqual([{ id: "gemini-a", displayName: "Gemini A" }, { id: "gemini-b" }]);
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(String(url)).toContain("/v1beta/models?");
        expect(String(url)).not.toContain(KEY);
        expect(init.headers["x-goog-api-key"]).toBe(KEY);
    });

    it("sigue la paginación", async () => {
        fetchMock
            .mockResolvedValueOnce(reply(200, { models: [{ name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] }], nextPageToken: "p2" }))
            .mockResolvedValueOnce(reply(200, { models: [{ name: "models/gemini-b", supportedGenerationMethods: ["generateContent"] }] }));

        const models = await provider.listModels(KEY);

        expect(models.map((model) => model.id)).toEqual(["gemini-a", "gemini-b"]);
        expect(String(fetchMock.mock.calls[1]![0])).toContain("pageToken=p2");
    });
});

describe("generate", () => {
    it("arma la petición con instrucción de sistema e historial y lee texto y uso", async () => {
        fetchMock.mockResolvedValueOnce(
            reply(200, {
                candidates: [{ content: { parts: [{ text: "pensando", thought: true }, { text: "Cuesta " }, { text: "50 soles." }] }, finishReason: "STOP" }],
                usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, thoughtsTokenCount: 5 },
            }),
        );

        const result = await provider.generate(generateParams);

        expect(result).toEqual({ text: "Cuesta 50 soles.", inputTokens: 30, outputTokens: 15 });
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(String(url)).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
        expect(String(url)).not.toContain(KEY);
        expect(init.method).toBe("POST");
        expect(init.headers["x-goog-api-key"]).toBe(KEY);
        expect(JSON.parse(init.body)).toEqual({
            systemInstruction: { parts: [{ text: "Eres un asistente" }] },
            contents: [
                { role: "user", parts: [{ text: "hola" }] },
                { role: "model", parts: [{ text: "¿en qué ayudo?" }] },
                { role: "user", parts: [{ text: "precio" }] },
            ],
            generationConfig: { maxOutputTokens: 500, temperature: 0.4 },
        });
    });

    it.each(["../../models", "a/b", "modelo con espacios", ""])("rechaza el id de modelo %j sin llamar a Google", async (model) => {
        await expect(provider.generate({ ...generateParams, model })).rejects.toMatchObject({ kind: "invalid_request" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("errores normalizados", () => {
    it.each([
        ["clave inválida (HTTP 400 con API_KEY_INVALID)", 400, { error: { status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, "auth"],
        ["401 sin autenticar", 401, { error: { status: "UNAUTHENTICATED" } }, "auth"],
        ["403 sin permiso", 403, { error: { status: "PERMISSION_DENIED" } }, "auth"],
        ["402 saldo agotado", 402, { error: {} }, "quota"],
        ["facturación no habilitada", 400, { error: { status: "FAILED_PRECONDITION" } }, "quota"],
        ["429 cuota diaria", 429, { error: { status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }] }] } }, "quota"],
        ["429 límite por minuto", 429, { error: { status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel" }] }] } }, "rate_limit"],
        ["429 sin detalle", 429, { error: { status: "RESOURCE_EXHAUSTED" } }, "rate_limit"],
        ["petición inválida", 400, { error: { status: "INVALID_ARGUMENT" } }, "invalid_request"],
        ["modelo inexistente", 404, { error: { status: "NOT_FOUND" } }, "invalid_request"],
        ["503 no disponible", 503, { error: { status: "UNAVAILABLE" } }, "unavailable"],
        ["500 error interno", 500, { error: {} }, "unavailable"],
    ])("%s → %s", async (_name, status, body, kind) => {
        fetchMock.mockResolvedValueOnce(reply(status, body));

        const error = await provider.generate(generateParams).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(AIProviderError);
        expect((error as AIProviderError).kind).toBe(kind);
        // El error nunca lleva la clave ni el contenido
        expect((error as AIProviderError).message).not.toContain(KEY);
        expect((error as AIProviderError).message).not.toContain("precio");
    });

    it("una caída de red es temporal", async () => {
        fetchMock.mockRejectedValueOnce(new TypeError(`fetch failed for key ${KEY}`));

        const error = await provider.generate(generateParams).catch((e: unknown) => e);

        expect((error as AIProviderError).kind).toBe("unavailable");
        expect((error as AIProviderError).isTemporary).toBe(true);
        expect((error as AIProviderError).message).not.toContain(KEY);
    });

    it("el contenido bloqueado por el proveedor no se responde", async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { promptFeedback: { blockReason: "SAFETY" } }));
        await expect(provider.generate(generateParams)).rejects.toMatchObject({ kind: "blocked" });

        fetchMock.mockResolvedValueOnce(reply(200, { candidates: [{ finishReason: "SAFETY" }] }));
        await expect(provider.generate(generateParams)).rejects.toMatchObject({ kind: "blocked" });
    });

    it("una respuesta sin texto es 'empty'", async () => {
        fetchMock.mockResolvedValueOnce(reply(200, { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] }));

        await expect(provider.generate(generateParams)).rejects.toMatchObject({ kind: "empty" });
    });

    it("solo lo temporal se considera reintentable", () => {
        expect(new AIProviderError("rate_limit").isTemporary).toBe(true);
        expect(new AIProviderError("unavailable").isTemporary).toBe(true);
        for (const kind of ["auth", "quota", "blocked", "invalid_request", "empty"] as const) {
            expect(new AIProviderError(kind).isTemporary).toBe(false);
        }
    });
});
