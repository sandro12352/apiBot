import type { AssistantInfo, UpsertAssistantInput } from "../entities/ai.entity";

export abstract class AssistantDatasource {
    // Asistente activo de la empresa (en el MVP, uno por empresa)
    abstract findActive(tenantId: string): Promise<AssistantInfo | null>;

    abstract upsert(tenantId: string, input: UpsertAssistantInput): Promise<AssistantInfo>;
}
