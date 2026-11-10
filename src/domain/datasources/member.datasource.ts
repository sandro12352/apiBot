import type {
    MemberMutationResult,
    MemberRemoveResult,
    TenantMember,
} from "../entities/tenant-member.entity";
import type { MembershipRole } from "../entities/tenant.entity";
import type { UserEntity } from "../entities/user.entity";

export abstract class MemberDatasource {
    abstract list(tenantId: string): Promise<TenantMember[]>;

    abstract findMember(tenantId: string, userId: string): Promise<TenantMember | null>;

    // Crea en una sola transacción el usuario (sin contraseña) y su membresía
    abstract createMember(
        tenantId: string,
        email: string,
        role: MembershipRole,
    ): Promise<{ user: UserEntity; member: TenantMember }>;

    // Las dos operaciones siguientes bloquean la fila del tenant dentro de la transacción
    // para que la regla "siempre queda un TENANT_ADMIN" no se rompa con peticiones simultáneas.
    abstract changeRole(tenantId: string, userId: string, role: MembershipRole): Promise<MemberMutationResult>;

    abstract remove(tenantId: string, userId: string): Promise<MemberRemoveResult>;
}
