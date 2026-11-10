import type {
    MemberMutationResult,
    MemberRemoveResult,
    TenantMember,
} from "../entities/tenant-member.entity";
import type { MembershipRole } from "../entities/tenant.entity";
import type { UserEntity } from "../entities/user.entity";

export abstract class MemberRepository {
    abstract list(tenantId: string): Promise<TenantMember[]>;

    abstract findMember(tenantId: string, userId: string): Promise<TenantMember | null>;

    abstract createMember(
        tenantId: string,
        email: string,
        role: MembershipRole,
    ): Promise<{ user: UserEntity; member: TenantMember }>;

    abstract changeRole(tenantId: string, userId: string, role: MembershipRole): Promise<MemberMutationResult>;

    abstract remove(tenantId: string, userId: string): Promise<MemberRemoveResult>;
}
