import type { AuditEntry } from "../entities/audit.entity";
import type { AuditRepository } from "../repositories/audit.repository";


export class AuditService {

    constructor(
        private readonly auditRepository: AuditRepository,
    ) {}

    // Nunca lanza: un fallo de auditoría no debe tumbar la operación principal
    async record(entry: AuditEntry): Promise<void> {
        try {
            await this.auditRepository.create(entry);
        } catch (error) {
            console.error('[AuditService.record]', entry.action, error);
        }
    }
}
