import type { UpdateTenantDto } from "../dtos/update-tenant.dto";
import type { UpdateTenantStatusDto } from "../dtos/update-tenant-status.dto";
import { AuditAction } from "../entities/audit.entity";
import type { TenantEntity, TenantMembershipRecord, UserTenant } from "../entities/tenant.entity";
import { CustomError } from "../errors/custom.error";
import type { TenantRepository } from "../repositories/tenant.repository";
import type { AuditService } from "./audit.service";


export class TenantService {

    constructor(
        private readonly tenantRepository: TenantRepository,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[TenantService.${action}]`, error);
        throw CustomError.databaseError(`Database error on tenant ${action}`);
    }


    async getById(id: string): Promise<TenantEntity> {
        try {
            const tenant = await this.tenantRepository.findById(id);
            if (!tenant) throw CustomError.notFound('Tenant not found');
            return tenant;
        } catch (error) {
            this.handleError(error, 'getById');
        }
    }

    async getAll(): Promise<TenantEntity[]> {
        try {
            return await this.tenantRepository.getAll();
        } catch (error) {
            this.handleError(error, 'getAll');
        }
    }

    async getMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null> {
        try {
            return await this.tenantRepository.findMembership(tenantId, userId);
        } catch (error) {
            this.handleError(error, 'getMembership');
        }
    }

    async getForUser(userId: string): Promise<UserTenant[]> {
        try {
            return await this.tenantRepository.findByUser(userId);
        } catch (error) {
            this.handleError(error, 'getForUser');
        }
    }

    // El acceso (membresía y rol) ya lo validó el middleware de tenant
    async update(tenantId: string, dto: UpdateTenantDto, actorUserId: string): Promise<TenantEntity> {
        try {
            const tenant = await this.tenantRepository.update(tenantId, { name: dto.name });
            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_UPDATE,
                resourceType: 'tenant',
                resourceId: tenantId,
                result: 'SUCCESS',
                metadata: { fields: 'name' },
            });
            return tenant;
        } catch (error) {
            this.handleError(error, 'update');
        }
    }

    // Solo administrador de plataforma
    async updateStatus(tenantId: string, dto: UpdateTenantStatusDto, actorUserId: string): Promise<TenantEntity> {
        try {
            const current = await this.tenantRepository.findById(tenantId);
            if (!current) throw CustomError.notFound('Tenant not found');

            const tenant = await this.tenantRepository.updateStatus(tenantId, dto.status);
            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.ADMIN_TENANT_STATUS,
                resourceType: 'tenant',
                resourceId: tenantId,
                result: 'SUCCESS',
                metadata: { from: current.status, to: dto.status },
            });
            return tenant;
        } catch (error) {
            this.handleError(error, 'updateStatus');
        }
    }
}
