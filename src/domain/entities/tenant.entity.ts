export type TenantStatus = "ACTIVE" | "SUSPENDED" | "CANCELLED";
export type MembershipRole = "TENANT_ADMIN" | "MEMBER";
export type BotMode = "TEST" | "LIVE";

export interface UpdateTenantData {
    name?: string | undefined;
}

// Membresía del usuario autenticado en un tenant
export interface TenantMembershipRecord {
    tenantId: string;
    userId: string;
    role: MembershipRole;
    tenantStatus: TenantStatus;
}

export class TenantEntity {
    constructor(
        public readonly id: string,
        public readonly name: string,
        public readonly slug: string,
        public readonly status: TenantStatus,
        public readonly botMode: BotMode,
        public readonly botEnabled: boolean,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) {}

    public static fromObject(object: { [key: string]: any }): TenantEntity {
        const { id, name, slug, status, botMode, botEnabled, createdAt, updatedAt } = object;

        if (!id) throw new Error("Missing id");
        if (!name) throw new Error("Missing name");
        if (!slug) throw new Error("Missing slug");
        if (!status) throw new Error("Missing status");

        return new TenantEntity(id, name, slug, status, botMode, botEnabled, createdAt, updatedAt);
    }
}

// Empresa del usuario junto con su rol (para /auth/me)
export interface UserTenant {
    tenant: TenantEntity;
    role: MembershipRole;
}
