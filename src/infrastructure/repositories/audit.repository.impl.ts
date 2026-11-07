import type { AuditDatasource, AuditEntry, AuditRepository } from "../../domain";


export class AuditRepositoryImpl implements AuditRepository {
    constructor(private readonly auditDatasource: AuditDatasource) {}

    create(entry: AuditEntry): Promise<void> {
        return this.auditDatasource.create(entry);
    }
}
