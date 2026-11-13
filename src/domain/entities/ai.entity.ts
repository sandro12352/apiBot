import type { AIProviderName } from "../../config/adapters/ai-provider";

export type CredentialState = "PENDING" | "VALID" | "INVALID" | "QUOTA_EXCEEDED";
export type ContextRoleName = "USER" | "ASSISTANT";

// Credencial tal como la ve el administrador: nunca incluye la clave, solo una versión enmascarada
export interface AiCredentialInfo {
    provider: AIProviderName;
    maskedKey: string;
    status: CredentialState;
    statusDetail: string | null;
    lastValidatedAt: Date | null;
    preferredModel: string | null;
    updatedAt: Date;
}

// Uso interno de los servicios: incluye la clave cifrada, no se expone por HTTP
export interface StoredAiCredential extends AiCredentialInfo {
    encryptedApiKey: string;
}

export interface SaveAiCredentialInput {
    encryptedApiKey: string;
    maskedKey: string;
    status: CredentialState;
    statusDetail: string | null;
    preferredModel: string | null;
}

export interface AssistantInfo {
    id: string;
    name: string;
    instructions: string;
    language: string;
    tone: string | null;
    businessRules: string | null;
    aiProvider: AIProviderName | null;
    aiModel: string | null;
    isActive: boolean;
    updatedAt: Date;
}

export interface UpsertAssistantInput {
    name: string;
    instructions: string;
    language: string;
    tone: string | null;
    businessRules: string | null;
    aiProvider: AIProviderName | null;
    aiModel: string | null;
}

export interface ContextRow {
    role: ContextRoleName;
    encryptedContent: string;
}

export interface UsageInput {
    tenantId: string;
    provider: AIProviderName;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    isTest: boolean;
}
