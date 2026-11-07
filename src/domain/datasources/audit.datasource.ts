import type { AuditEntry } from "../entities/audit.entity";


export abstract class AuditDatasource {
    abstract create(entry: AuditEntry): Promise<void>;
}
