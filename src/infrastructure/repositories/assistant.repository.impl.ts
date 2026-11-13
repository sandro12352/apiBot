import type {
    AssistantDatasource,
    AssistantInfo,
    AssistantRepository,
    UpsertAssistantInput,
} from "../../domain";

export class AssistantRepositoryImpl implements AssistantRepository {
    constructor(private readonly datasource: AssistantDatasource) {}

    findActive(tenantId: string): Promise<AssistantInfo | null> {
        return this.datasource.findActive(tenantId);
    }

    upsert(tenantId: string, input: UpsertAssistantInput): Promise<AssistantInfo> {
        return this.datasource.upsert(tenantId, input);
    }
}
