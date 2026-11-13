export type AIProviderName = "OPENAI" | "ANTHROPIC" | "GEMINI";

export interface AIModel {
    id: string;
    displayName?: string;
}

export interface AIMessage {
    role: "user" | "assistant";
    content: string;
}

export interface GenerateParams {
    apiKey: string;
    model: string;
    systemPrompt: string;
    // Historial en orden cronológico; el último es el mensaje que hay que responder
    messages: AIMessage[];
    maxOutputTokens: number;
}

export interface GenerateResult {
    text: string;
    inputTokens?: number;
    outputTokens?: number;
}

// auth: clave inválida o sin permiso · quota: sin saldo o cuota diaria agotada
// rate_limit / unavailable: temporales · blocked: el proveedor rechazó el contenido
// invalid_request: petición o modelo inválidos · empty: respuesta sin texto
export type AIErrorKind = "auth" | "quota" | "rate_limit" | "unavailable" | "blocked" | "invalid_request" | "empty";

// Error normalizado de un proveedor de IA: nunca incluye la clave ni el contenido de los mensajes
export class AIProviderError extends Error {
    constructor(
        public readonly kind: AIErrorKind,
        public readonly httpStatus?: number,
    ) {
        super(`AI provider error (${kind}${httpStatus !== undefined ? `, HTTP ${httpStatus}` : ""})`);
        this.name = "AIProviderError";
    }

    // Se resuelven solos: tiene sentido reintentar
    get isTemporary(): boolean {
        return this.kind === "rate_limit" || this.kind === "unavailable";
    }
}

// Contrato común: la lógica del bot no conoce el SDK ni el formato de ningún proveedor
export abstract class AIProvider {
    abstract readonly name: AIProviderName;

    // Modelos de texto que acepta la clave. Sirve también para validar la clave.
    abstract listModels(apiKey: string): Promise<AIModel[]>;

    abstract generate(params: GenerateParams): Promise<GenerateResult>;
}

export class AIProviderRegistry {
    private readonly providers = new Map<AIProviderName, AIProvider>();

    constructor(providers: AIProvider[]) {
        for (const provider of providers) this.providers.set(provider.name, provider);
    }

    get(name: AIProviderName): AIProvider | undefined {
        return this.providers.get(name);
    }
}
