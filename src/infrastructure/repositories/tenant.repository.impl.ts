import type {
    TenantDatasource,
    TenantEntity,
    TenantMembershipRecord,
    TenantRepository,
    TenantStatus,
    UpdateTenantData,
    UserTenant,
} from "../../domain";


export class TenantRepositoryImpl implements TenantRepository {
    constructor(private readonly tenantDatasource: TenantDatasource) {}

    findById(id: string): Promise<TenantEntity | null> {
        return this.tenantDatasource.findById(id);
    }

    getAll(): Promise<TenantEntity[]> {
        return this.tenantDatasource.getAll();
    }

    update(id: string, data: UpdateTenantData): Promise<TenantEntity> {
        return this.tenantDatasource.update(id, data);
    }

    updateStatus(id: string, status: TenantStatus): Promise<TenantEntity> {
        return this.tenantDatasource.updateStatus(id, status);
    }

    findMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null> {
        return this.tenantDatasource.findMembership(tenantId, userId);
    }

    findByUser(userId: string): Promise<UserTenant[]> {
        return this.tenantDatasource.findByUser(userId);
    }
}
