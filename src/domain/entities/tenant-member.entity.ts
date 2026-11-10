import type { MembershipRole } from "./tenant.entity";
import type { UserStatus } from "./user.entity";

// Miembro de una empresa tal como lo ve su administrador (sin datos sensibles)
export interface TenantMember {
    userId: string;
    email: string;
    role: MembershipRole;
    status: UserStatus;
    // false = cuenta creada pero el usuario aún no definió su contraseña
    passwordSet: boolean;
    createdAt: Date;
}

// Resultado de operaciones que respetan la regla "la empresa siempre tiene un TENANT_ADMIN"
export type MemberMutationResult =
    | { status: "ok"; member: TenantMember }
    | { status: "not_found" }
    | { status: "last_admin" };

export type MemberRemoveResult =
    | { status: "ok" }
    | { status: "not_found" }
    | { status: "last_admin" };
