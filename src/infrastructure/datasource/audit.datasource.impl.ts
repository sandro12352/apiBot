import { prisma } from "../../data/postgres";
import { AuditDatasource, type AuditEntry } from "../../domain";

export class AuditDatasourceImpl extends AuditDatasource {

    async create(entry: AuditEntry): Promise<void> {
        await prisma.auditLog.create({
            data: {
                actorUserId: entry.actorUserId,
                tenantId: entry.tenantId,
                action: entry.action,
                resourceType: entry.resourceType,
                resourceId: entry.resourceId,
                result: entry.result,
                ...(entry.metadata ? { metadata: entry.metadata } : {}),
            },
        });
    }
}
