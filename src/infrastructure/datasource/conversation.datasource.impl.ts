import { prisma } from "../../data/postgres";
import { ConversationDatasource, type ContextRow, type ContextRoleName, type UsageInput } from "../../domain";

export class ConversationDatasourceImpl extends ConversationDatasource {

    async upsertLead(
        tenantId: string,
        connectionId: string,
        whatsappNumber: string,
        isTest: boolean,
    ): Promise<string> {
        const lead = await prisma.lead.upsert({
            where: { connectionId_whatsappNumber: { connectionId, whatsappNumber } },
            update: { lastActivityAt: new Date() },
            create: { tenantId, connectionId, whatsappNumber, isTest },
            select: { id: true },
        });
        return lead.id;
    }

    async recentContext(leadId: string, limit: number): Promise<ContextRow[]> {
        const rows = await prisma.conversationContext.findMany({
            where: { leadId },
            orderBy: { createdAt: "desc" },
            take: limit,
            select: { role: true, encryptedContent: true },
        });
        // Se leyeron del más reciente al más antiguo; el modelo los necesita en orden cronológico
        return rows.reverse().map((row) => ({ role: row.role as ContextRoleName, encryptedContent: row.encryptedContent }));
    }

    async appendContext(
        tenantId: string,
        leadId: string,
        rows: ContextRow[],
        expiresAt: Date,
        keep: number,
    ): Promise<void> {
        await prisma.$transaction(async (tx) => {
            // Marcas de tiempo distintas por mensaje: el orden del contexto depende de createdAt
            const base = Date.now();
            await tx.conversationContext.createMany({
                data: rows.map((row, index) => ({
                    tenantId,
                    leadId,
                    role: row.role,
                    encryptedContent: row.encryptedContent,
                    createdAt: new Date(base + index),
                    expiresAt,
                })),
            });

            // Todo el contexto del contacto vence 7 días después de su última actividad
            await tx.conversationContext.updateMany({ where: { leadId }, data: { expiresAt } });

            const excess = await tx.conversationContext.findMany({
                where: { leadId },
                orderBy: { createdAt: "desc" },
                skip: keep,
                select: { id: true },
            });
            if (excess.length > 0) {
                await tx.conversationContext.deleteMany({ where: { id: { in: excess.map((row) => row.id) } } });
            }
        });
    }

    async deleteExpired(now: Date): Promise<number> {
        const result = await prisma.conversationContext.deleteMany({ where: { expiresAt: { lt: now } } });
        return result.count;
    }

    async recordUsage(input: UsageInput): Promise<void> {
        await prisma.usageEvent.create({
            data: {
                tenantId: input.tenantId,
                type: "AI_RESPONSE",
                provider: input.provider,
                model: input.model,
                isTest: input.isTest,
                ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
                ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
            },
        });
    }
}
