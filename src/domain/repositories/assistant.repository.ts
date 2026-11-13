import type { AssistantInfo, UpsertAssistantInput } from "../entities/ai.entity";

export abstract class AssistantRepository {
    abstract findActive(tenantId: string): Promise<AssistantInfo | null>;
    abstract upsert(tenantId: string, input: UpsertAssistantInput): Promise<AssistantInfo>;
}
