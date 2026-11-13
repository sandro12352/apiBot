import { prisma } from "../../data/postgres";
import {
    AiCredentialDatasource,
    type AIProviderName,
    type AiCredentialInfo,
    type CredentialState,
    type SaveAiCredentialInput,
    type StoredAiCredential,
} from "../../domain";

type Row = {
    provider: string;
    maskedKey: string;
    status: string;
    statusDetail: string | null;
    lastValidatedAt: Date | null;
    preferredModel: string | null;
    updatedAt: Date;
};

// Nunca se copia encryptedApiKey a la vista pública
const toInfo = (row: Row): AiCredentialInfo => ({
    provider: row.provider as AIProviderName,
    maskedKey: row.maskedKey,
    status: row.status as CredentialState,
    statusDetail: row.statusDetail,
    lastValidatedAt: row.lastValidatedAt,
    preferredModel: row.preferredModel,
    updatedAt: row.updatedAt,
});

export class AiCredentialDatasourceImpl extends AiCredentialDatasource {

    async list(tenantId: string): Promise<AiCredentialInfo[]> {
        const rows = await prisma.aiProviderCredential.findMany({ where: { tenantId }, orderBy: { provider: "asc" } });
        return rows.map(toInfo);
    }

    async find(tenantId: string, provider: AIProviderName): Promise<StoredAiCredential | null> {
        const row = await prisma.aiProviderCredential.findUnique({
            where: { tenantId_provider: { tenantId, provider } },
        });
        return row ? { ...toInfo(row), encryptedApiKey: row.encryptedApiKey } : null;
    }

    async save(tenantId: string, provider: AIProviderName, input: SaveAiCredentialInput): Promise<AiCredentialInfo> {
        const data = {
            encryptedApiKey: input.encryptedApiKey,
            maskedKey: input.maskedKey,
            status: input.status,
            statusDetail: input.statusDetail,
            preferredModel: input.preferredModel,
            lastValidatedAt: input.status === "VALID" ? new Date() : null,
        };
        const row = await prisma.aiProviderCredential.upsert({
            where: { tenantId_provider: { tenantId, provider } },
            update: data,
            create: { tenantId, provider, ...data },
        });
        return toInfo(row);
    }

    async setStatus(
        tenantId: string,
        provider: AIProviderName,
        status: CredentialState,
        detail: string | null,
    ): Promise<void> {
        await prisma.aiProviderCredential.updateMany({
            where: { tenantId, provider },
            data: {
                status,
                statusDetail: detail,
                ...(status === "VALID" ? { lastValidatedAt: new Date() } : {}),
            },
        });
    }

    async remove(tenantId: string, provider: AIProviderName): Promise<boolean> {
        const result = await prisma.aiProviderCredential.deleteMany({ where: { tenantId, provider } });
        return result.count > 0;
    }
}
