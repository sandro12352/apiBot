import type { UpsertAssistantDto } from "../dtos/upsert-assistant.dto";
import { AuditAction } from "../entities/audit.entity";
import type { AssistantInfo } from "../entities/ai.entity";
import { CustomError } from "../errors/custom.error";
import type { AssistantRepository } from "../repositories/assistant.repository";
import type { AuditService } from "./audit.service";

// Asistente de UNA empresa (instrucciones, tono, reglas). El tenantId sale de req.tenant.
export class AssistantService {

    constructor(
        private readonly repository: AssistantRepository,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[AssistantService.${action}]`, error instanceof Error ? error.name : "error");
        throw CustomError.databaseError(`Database error on assistant ${action}`);
    }

    async get(tenantId: string): Promise<AssistantInfo> {
        try {
            const assistant = await this.repository.findActive(tenantId);
            if (!assistant) throw CustomError.notFound("Assistant not found");
            return assistant;
        } catch (error) {
            this.handleError(error, "get");
        }
    }

    async upsert(tenantId: string, dto: UpsertAssistantDto, actorUserId: string): Promise<AssistantInfo> {
        try {
            const assistant = await this.repository.upsert(tenantId, {
                name: dto.name,
                instructions: dto.instructions,
                language: dto.language,
                tone: dto.tone,
                businessRules: dto.businessRules,
                aiProvider: dto.aiProvider,
                aiModel: dto.aiModel,
            });

            // Sin el contenido de las instrucciones: solo constancia del cambio
            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.ASSISTANT_UPDATE,
                resourceType: "assistant",
                resourceId: assistant.id,
                result: "SUCCESS",
            });
            return assistant;
        } catch (error) {
            this.handleError(error, "upsert");
        }
    }
}
