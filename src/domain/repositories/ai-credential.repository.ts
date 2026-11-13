import type { AIProviderName } from "../../config/adapters/ai-provider";
import type {
    AiCredentialInfo,
    CredentialState,
    SaveAiCredentialInput,
    StoredAiCredential,
} from "../entities/ai.entity";

export abstract class AiCredentialRepository {
    abstract list(tenantId: string): Promise<AiCredentialInfo[]>;
    abstract find(tenantId: string, provider: AIProviderName): Promise<StoredAiCredential | null>;
    abstract save(tenantId: string, provider: AIProviderName, input: SaveAiCredentialInput): Promise<AiCredentialInfo>;
    abstract setStatus(
        tenantId: string,
        provider: AIProviderName,
        status: CredentialState,
        detail: string | null,
    ): Promise<void>;
    abstract remove(tenantId: string, provider: AIProviderName): Promise<boolean>;
}
