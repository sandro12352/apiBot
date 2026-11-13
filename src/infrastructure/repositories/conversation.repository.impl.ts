import type { ContextRow, ConversationDatasource, ConversationRepository, UsageInput } from "../../domain";

export class ConversationRepositoryImpl implements ConversationRepository {
    constructor(private readonly datasource: ConversationDatasource) {}

    upsertLead(tenantId: string, connectionId: string, whatsappNumber: string, isTest: boolean): Promise<string> {
        return this.datasource.upsertLead(tenantId, connectionId, whatsappNumber, isTest);
    }

    recentContext(leadId: string, limit: number): Promise<ContextRow[]> {
        return this.datasource.recentContext(leadId, limit);
    }

    appendContext(tenantId: string, leadId: string, rows: ContextRow[], expiresAt: Date, keep: number): Promise<void> {
        return this.datasource.appendContext(tenantId, leadId, rows, expiresAt, keep);
    }

    deleteExpired(now: Date): Promise<number> {
        return this.datasource.deleteExpired(now);
    }

    recordUsage(input: UsageInput): Promise<void> {
        return this.datasource.recordUsage(input);
    }
}
