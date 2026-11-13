import type { ContextRow, UsageInput } from "../entities/ai.entity";

export abstract class ConversationRepository {
    abstract upsertLead(tenantId: string, connectionId: string, whatsappNumber: string, isTest: boolean): Promise<string>;
    abstract recentContext(leadId: string, limit: number): Promise<ContextRow[]>;
    abstract appendContext(
        tenantId: string,
        leadId: string,
        rows: ContextRow[],
        expiresAt: Date,
        keep: number,
    ): Promise<void>;
    abstract deleteExpired(now: Date): Promise<number>;
    abstract recordUsage(input: UsageInput): Promise<void>;
}
