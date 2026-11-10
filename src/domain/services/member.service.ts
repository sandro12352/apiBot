import type { AddMemberDto } from "../dtos/add-member.dto";
import type { UpdateMemberRoleDto } from "../dtos/update-member-role.dto";
import { AuditAction } from "../entities/audit.entity";
import type { TenantMember } from "../entities/tenant-member.entity";
import { CustomError } from "../errors/custom.error";
import type { MemberRepository } from "../repositories/member.repository";
import type { UserRepository } from "../repositories/user.repository";
import type { AuditService } from "./audit.service";
import type { AuthService } from "./auth.service";

const MEMBER_NOT_FOUND = 'Member not found';
const LAST_ADMIN_MESSAGE = 'The company must keep at least one administrator';

// Gestión de los miembros de UNA empresa. El acceso (membresía TENANT_ADMIN) ya lo
// validó TenantMiddleware; el tenantId que llega aquí sale de req.tenant, nunca del body.
export class MemberService {

    constructor(
        private readonly memberRepository: MemberRepository,
        private readonly userRepository: UserRepository,
        private readonly authService: AuthService,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[MemberService.${action}]`, error);
        throw CustomError.databaseError(`Database error on member ${action}`);
    }

    // Violación de unicidad de Prisma (dos altas simultáneas con el mismo email)
    private isUniqueViolation(error: unknown): boolean {
        return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
    }


    async list(tenantId: string): Promise<TenantMember[]> {
        try {
            return await this.memberRepository.list(tenantId);
        } catch (error) {
            this.handleError(error, 'list');
        }
    }

    // Crea el usuario sin contraseña + membresía y le envía el enlace para definirla
    async add(tenantId: string, dto: AddMemberDto, actorUserId: string): Promise<TenantMember> {
        try {
            // No se vincula a una empresa una cuenta que ya existe (el titular no ha dado
            // su consentimiento). El mensaje es genérico: no confirma de quién es la cuenta.
            const exists = await this.userRepository.findByEmail(dto.email);
            if (exists) throw CustomError.conflict('This email cannot be added');

            let created;
            try {
                created = await this.memberRepository.createMember(tenantId, dto.email, dto.role);
            } catch (error) {
                if (this.isUniqueViolation(error)) throw CustomError.conflict('This email cannot be added');
                throw error;
            }
            const { user, member } = created;

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_MEMBER_ADD,
                resourceType: 'user',
                resourceId: user.id,
                result: 'SUCCESS',
                metadata: { role: dto.role },
            });

            // La cuenta ya existe: si el correo falla, hay que avisar y permitir reintentar
            try {
                await this.authService.sendAccountSetupEmail(user);
            } catch {
                throw CustomError.internalServerError(
                    `Member created (user id ${user.id}) but the setup email could not be sent. ` +
                    `Retry with POST /tenants/${tenantId}/members/${user.id}/setup-email`,
                );
            }
            return member;
        } catch (error) {
            this.handleError(error, 'add');
        }
    }

    async changeRole(
        tenantId: string,
        userId: string,
        dto: UpdateMemberRoleDto,
        actorUserId: string,
    ): Promise<TenantMember> {
        try {
            const result = await this.memberRepository.changeRole(tenantId, userId, dto.role);
            if (result.status === 'not_found') throw CustomError.notFound(MEMBER_NOT_FOUND);
            if (result.status === 'last_admin') throw CustomError.conflict(LAST_ADMIN_MESSAGE);

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_MEMBER_ROLE,
                resourceType: 'user',
                resourceId: userId,
                result: 'SUCCESS',
                metadata: { role: dto.role },
            });
            return result.member;
        } catch (error) {
            this.handleError(error, 'changeRole');
        }
    }

    // Quita la membresía; la cuenta del usuario no se borra
    async remove(tenantId: string, userId: string, actorUserId: string): Promise<void> {
        try {
            const result = await this.memberRepository.remove(tenantId, userId);
            if (result.status === 'not_found') throw CustomError.notFound(MEMBER_NOT_FOUND);
            if (result.status === 'last_admin') throw CustomError.conflict(LAST_ADMIN_MESSAGE);

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_MEMBER_REMOVE,
                resourceType: 'user',
                resourceId: userId,
                result: 'SUCCESS',
            });
        } catch (error) {
            this.handleError(error, 'remove');
        }
    }

    // Reenvía el enlace (p. ej. si caducó). Solo a miembros de ESTA empresa sin contraseña.
    async resendSetupEmail(tenantId: string, userId: string): Promise<void> {
        try {
            const member = await this.memberRepository.findMember(tenantId, userId);
            if (!member) throw CustomError.notFound(MEMBER_NOT_FOUND);
            if (member.passwordSet) throw CustomError.badRequest('User already has a password');

            const user = await this.userRepository.findById(userId);
            if (!user) throw CustomError.notFound(MEMBER_NOT_FOUND);

            await this.authService.sendAccountSetupEmail(user);
        } catch (error) {
            this.handleError(error, 'resendSetupEmail');
        }
    }

}
