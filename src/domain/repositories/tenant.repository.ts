import type {
    TenantEntity,
    TenantMembershipRecord,
    TenantStatus,
    UpdateTenantData,
    UserTenant,
} from "../entities/tenant.entity";


export abstract class TenantRepository {
    abstract findById(id: string): Promise<TenantEntity | null>;

    abstract getAll(): Promise<TenantEntity[]>;

    abstract update(id: string, data: UpdateTenantData): Promise<TenantEntity>;

    abstract updateStatus(id: string, status: TenantStatus): Promise<TenantEntity>;

    abstract findMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null>;

    abstract findByUser(userId: string): Promise<UserTenant[]>;
}
