import { prisma } from "../../data/postgres";
import {
    MemberDatasource,
    UserEntity,
    type MemberMutationResult,
    type MemberRemoveResult,
    type MembershipRole,
    type TenantMember,
} from "../../domain";

type MembershipWithUser = {
    userId: string;
    role: MembershipRole;
    createdAt: Date;
    user: { email: string; status: TenantMember["status"]; passwordHash: string | null };
};

const memberSelect = {
    userId: true,
    role: true,
    createdAt: true,
    user: { select: { email: true, status: true, passwordHash: true } },
} as const;

const toMember = (row: MembershipWithUser): TenantMember => ({
    userId: row.userId,
    email: row.user.email,
    role: row.role,
    status: row.user.status,
    passwordSet: row.user.passwordHash !== null,
    createdAt: row.createdAt,
});

export class MemberDatasourceImpl extends MemberDatasource {

    async list(tenantId: string): Promise<TenantMember[]> {
        const rows = await prisma.tenantMembership.findMany({
            where: { tenantId },
            select: memberSelect,
            orderBy: { createdAt: "asc" },
        });
        return rows.map(toMember);
    }

    async findMember(tenantId: string, userId: string): Promise<TenantMember | null> {
        const row = await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId } },
            select: memberSelect,
        });
        return row ? toMember(row) : null;
    }

    async createMember(
        tenantId: string,
        email: string,
        role: MembershipRole,
    ): Promise<{ user: UserEntity; member: TenantMember }> {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.create({ data: { email } });
            const membership = await tx.tenantMembership.create({
                data: { tenantId, userId: user.id, role },
                select: memberSelect,
            });
            return { user: UserEntity.fromObject(user), member: toMember(membership) };
        });
    }

    async changeRole(tenantId: string, userId: string, role: MembershipRole): Promise<MemberMutationResult> {
        return prisma.$transaction(async (tx) => {
            // Serializa los cambios de miembros de esta empresa
            await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;

            const current = await tx.tenantMembership.findUnique({
                where: { tenantId_userId: { tenantId, userId } },
                select: { role: true },
            });
            if (!current) return { status: "not_found" } as const;

            if (current.role === "TENANT_ADMIN" && role !== "TENANT_ADMIN") {
                const admins = await tx.tenantMembership.count({ where: { tenantId, role: "TENANT_ADMIN" } });
                if (admins <= 1) return { status: "last_admin" } as const;
            }

            const updated = await tx.tenantMembership.update({
                where: { tenantId_userId: { tenantId, userId } },
                data: { role },
                select: memberSelect,
            });
            return { status: "ok", member: toMember(updated) } as const;
        });
    }

    async remove(tenantId: string, userId: string): Promise<MemberRemoveResult> {
        return prisma.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;

            const current = await tx.tenantMembership.findUnique({
                where: { tenantId_userId: { tenantId, userId } },
                select: { role: true },
            });
            if (!current) return { status: "not_found" } as const;

            if (current.role === "TENANT_ADMIN") {
                const admins = await tx.tenantMembership.count({ where: { tenantId, role: "TENANT_ADMIN" } });
                if (admins <= 1) return { status: "last_admin" } as const;
            }

            await tx.tenantMembership.delete({ where: { tenantId_userId: { tenantId, userId } } });
            return { status: "ok" } as const;
        });
    }
}
