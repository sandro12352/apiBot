import type {
    MemberDatasource,
    MemberMutationResult,
    MemberRemoveResult,
    MemberRepository,
    MembershipRole,
    TenantMember,
    UserEntity,
} from "../../domain";


export class MemberRepositoryImpl implements MemberRepository {
    constructor(private readonly memberDatasource: MemberDatasource) {}

    list(tenantId: string): Promise<TenantMember[]> {
        return this.memberDatasource.list(tenantId);
    }

    findMember(tenantId: string, userId: string): Promise<TenantMember | null> {
        return this.memberDatasource.findMember(tenantId, userId);
    }

    createMember(
        tenantId: string,
        email: string,
        role: MembershipRole,
    ): Promise<{ user: UserEntity; member: TenantMember }> {
        return this.memberDatasource.createMember(tenantId, email, role);
    }

    changeRole(tenantId: string, userId: string, role: MembershipRole): Promise<MemberMutationResult> {
        return this.memberDatasource.changeRole(tenantId, userId, role);
    }

    remove(tenantId: string, userId: string): Promise<MemberRemoveResult> {
        return this.memberDatasource.remove(tenantId, userId);
    }
}
