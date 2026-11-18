import type { CreateKnowledgeDto } from "../dtos/create-knowledge.dto";
import type { UpdateKnowledgeDto } from "../dtos/update-knowledge.dto";
import { AuditAction, type AuditActionName } from "../entities/audit.entity";
import { KNOWLEDGE_MAX_ENTRIES, type KnowledgeEntry, type KnowledgeType } from "../entities/knowledge.entity";
import { CustomError } from "../errors/custom.error";
import type { KnowledgeRepository } from "../repositories/knowledge.repository";
import type { AuditService } from "./audit.service";

// FAQ y textos de UNA empresa. El tenantId sale de req.tenant (ya validado por el middleware).
// La auditoría no guarda el contenido, solo constancia de la acción.
export class KnowledgeService {

    constructor(
        private readonly repository: KnowledgeRepository,
        private readonly auditService: AuditService,
    ) {}

    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[KnowledgeService.${action}]`, error instanceof Error ? error.name : "error");
        throw CustomError.databaseError(`Database error on knowledge ${action}`);
    }

    private audit(tenantId: string, actorUserId: string, action: AuditActionName, id: string, metadata?: Record<string, string>) {
        return this.auditService.record({
            actorUserId,
            tenantId,
            action,
            resourceType: "knowledge",
            resourceId: id,
            result: "SUCCESS",
            ...(metadata ? { metadata } : {}),
        });
    }

    async list(tenantId: string, type?: KnowledgeType): Promise<KnowledgeEntry[]> {
        try {
            return await this.repository.list(tenantId, type);
        } catch (error) {
            this.handleError(error, "list");
        }
    }

    async get(tenantId: string, id: string): Promise<KnowledgeEntry> {
        try {
            const entry = await this.repository.find(tenantId, id);
            if (!entry) throw CustomError.notFound("Knowledge entry not found");
            return entry;
        } catch (error) {
            this.handleError(error, "get");
        }
    }

    async create(tenantId: string, dto: CreateKnowledgeDto, actorUserId: string): Promise<KnowledgeEntry> {
        try {
            if ((await this.repository.count(tenantId)) >= KNOWLEDGE_MAX_ENTRIES) {
                throw CustomError.conflict(`Knowledge base limit reached (${KNOWLEDGE_MAX_ENTRIES} entries)`);
            }
            const entry = await this.repository.create(tenantId, {
                type: dto.type,
                title: dto.title,
                content: dto.content,
                isActive: dto.isActive,
            });
            await this.audit(tenantId, actorUserId, AuditAction.KNOWLEDGE_CREATE, entry.id, { type: entry.type });
            return entry;
        } catch (error) {
            this.handleError(error, "create");
        }
    }

    async update(tenantId: string, id: string, dto: UpdateKnowledgeDto, actorUserId: string): Promise<KnowledgeEntry> {
        try {
            const entry = await this.repository.update(tenantId, id, {
                ...(dto.title !== undefined ? { title: dto.title } : {}),
                ...(dto.content !== undefined ? { content: dto.content } : {}),
                ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            });
            if (!entry) throw CustomError.notFound("Knowledge entry not found");
            await this.audit(tenantId, actorUserId, AuditAction.KNOWLEDGE_UPDATE, id);
            return entry;
        } catch (error) {
            this.handleError(error, "update");
        }
    }

    async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
        try {
            if (!(await this.repository.remove(tenantId, id))) throw CustomError.notFound("Knowledge entry not found");
            await this.audit(tenantId, actorUserId, AuditAction.KNOWLEDGE_DELETE, id);
        } catch (error) {
            this.handleError(error, "remove");
        }
    }
}
