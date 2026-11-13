import type {
    AIProviderName,
    AiCredentialDatasource,
    AiCredentialInfo,
    AiCredentialRepository,
    CredentialState,
    SaveAiCredentialInput,
    StoredAiCredential,
} from "../../domain";

export class AiCredentialRepositoryImpl implements AiCredentialRepository {
    constructor(private readonly datasource: AiCredentialDatasource) {}

    list(tenantId: string): Promise<AiCredentialInfo[]> {
        return this.datasource.list(tenantId);
    }

    find(tenantId: string, provider: AIProviderName): Promise<StoredAiCredential | null> {
        return this.datasource.find(tenantId, provider);
    }

    save(tenantId: string, provider: AIProviderName, input: SaveAiCredentialInput): Promise<AiCredentialInfo> {
        return this.datasource.save(tenantId, provider, input);
    }

    setStatus(tenantId: string, provider: AIProviderName, status: CredentialState, detail: string | null): Promise<void> {
        return this.datasource.setStatus(tenantId, provider, status, detail);
    }

    remove(tenantId: string, provider: AIProviderName): Promise<boolean> {
        return this.datasource.remove(tenantId, provider);
    }
}
