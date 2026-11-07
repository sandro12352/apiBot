import type { AuditEntry } from "../entities/audit.entity";


export abstract class AuditRepository {
    abstract create(entry: AuditEntry): Promise<void>;
}
