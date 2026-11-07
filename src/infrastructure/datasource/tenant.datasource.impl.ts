import { prisma } from "../../data/postgres";
import {
    TenantDatasource,
    TenantEntity,
    type TenantMembershipRecord,
    type TenantStatus,
    type UpdateTenantData,
    type UserTenant,
} from "../../domain";

export class TenantDatasourceImpl extends TenantDatasource {

    async findById(id: string): Promise<TenantEntity | null> {
        const tenant = await prisma.tenant.findUnique({ where: { id } });
        return tenant ? TenantEntity.fromObject(tenant) : null;
    }

    async getAll(): Promise<TenantEntity[]> {
        const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "desc" } });
        return tenants.map((tenant) => TenantEntity.fromObject(tenant));
    }

    async update(id: string, data: UpdateTenantData): Promise<TenantEntity> {
        const tenant = await prisma.tenant.update({
            where: { id },
            data: { ...(data.name !== undefined ? { name: data.name } : {}) },
        });
        return TenantEntity.fromObject(tenant);
    }

    async updateStatus(id: string, status: TenantStatus): Promise<TenantEntity> {
        const tenant = await prisma.tenant.update({ where: { id }, data: { status } });
        return TenantEntity.fromObject(tenant);
    }

    async findMembership(tenantId: string, userId: string): Promise<TenantMembershipRecord | null> {
        const membership = await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            select: { tenantId: true, userId: true, role: true, tenant: { select: { status: true } } },
        });
        if (!membership) return null;

        const { tenant, ...record } = membership;
        return { ...record, tenantStatus: tenant.status };
    }

    async findByUser(userId: string): Promise<UserTenant[]> {
        const memberships = await prisma.tenantMembership.findMany({
            where: { userId },
            include: { tenant: true },
            orderBy: { createdAt: "asc" },
        });
        return memberships.map(({ tenant, role }) => ({ tenant: TenantEntity.fromObject(tenant), role }));
    }
}
