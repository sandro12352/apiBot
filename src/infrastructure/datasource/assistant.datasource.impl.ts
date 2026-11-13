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
};

const toInfo = (row: Row): AssistantInfo => ({
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    language: row.language,
    tone: row.tone,
    businessRules: row.businessRules,
    aiProvider: row.aiProvider as AIProviderName | null,
    aiModel: row.aiModel,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
});

export class AssistantDatasourceImpl extends AssistantDatasource {

    async findActive(tenantId: string): Promise<AssistantInfo | null> {
        const row = await prisma.assistant.findFirst({
            where: { tenantId, isActive: true },
            orderBy: { createdAt: "asc" },
        });
        return row ? toInfo(row) : null;
    }

    async upsert(tenantId: string, input: UpsertAssistantInput): Promise<AssistantInfo> {
        const existing = await prisma.assistant.findFirst({
            where: { tenantId },
            orderBy: { createdAt: "asc" },
            select: { id: true },
        });
        const data = { ...input, isActive: true };
        const row = existing
            ? await prisma.assistant.update({ where: { id: existing.id }, data })
            : await prisma.assistant.create({ data: { tenantId, ...data } });
        return toInfo(row);
    }
}
