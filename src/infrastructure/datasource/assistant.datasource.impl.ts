import { prisma } from "../../data/postgres";
import {
    AssistantDatasource,
    type AIProviderName,
    type AssistantInfo,
    type UpsertAssistantInput,
} from "../../domain";

type Row = {
    id: string;
    name: string;
    instructions: string;
    language: string;
    tone: string | null;
    businessRules: string | null;
    aiProvider: string | null;
    aiModel: string | null;
    isActive: boolean;
    updatedAt: Date;
    // El mensaje de bienvenida vive en la empresa (tenants.aiNoticeText)
    tenant: { aiNoticeText: string | null };
};

const withWelcome = { tenant: { select: { aiNoticeText: true } } } as const;

const toInfo = (row: Row): AssistantInfo => ({
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    language: row.language,
    tone: row.tone,
    businessRules: row.businessRules,
    aiProvider: row.aiProvider as AIProviderName | null,
    aiModel: row.aiModel,
    welcomeMessage: row.tenant.aiNoticeText,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
});

export class AssistantDatasourceImpl extends AssistantDatasource {

    async findActive(tenantId: string): Promise<AssistantInfo | null> {
        const row = await prisma.assistant.findFirst({
            where: { tenantId, isActive: true },
            orderBy: { createdAt: "asc" },
            include: withWelcome,
        });
        return row ? toInfo(row) : null;
    }

    async upsert(tenantId: string, input: UpsertAssistantInput): Promise<AssistantInfo> {
        const { welcomeMessage, ...fields } = input;

        // Asistente y mensaje de bienvenida se guardan juntos o no se guarda ninguno
        return prisma.$transaction(async (tx) => {
            await tx.tenant.update({ where: { id: tenantId }, data: { aiNoticeText: welcomeMessage } });

            const existing = await tx.assistant.findFirst({
                where: { tenantId },
                orderBy: { createdAt: "asc" },
                select: { id: true },
            });
            const data = { ...fields, isActive: true };
            const row = existing
                ? await tx.assistant.update({ where: { id: existing.id }, data, include: withWelcome })
                : await tx.assistant.create({ data: { tenantId, ...data }, include: withWelcome });
            return toInfo(row);
        });
    }
}
