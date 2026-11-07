import { randomBytes } from "node:crypto";
import type { ClientAccount } from "../datasources/admin.datasource";
import type { CreateClientDto } from "../dtos/create-client.dto";
import { CustomError } from "../errors/custom.error";
import type { AdminRepository } from "../repositories/admin.repository";
import type { UserRepository } from "../repositories/user.repository";
import { AuditAction } from "../entities/audit.entity";
import type { AuditService } from "./audit.service";
import type { AuthService } from "./auth.service";

const slugify = (name: string): string =>
    name
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "empresa";


export class AdminService {

    constructor(
        private readonly adminRepository: AdminRepository,
        private readonly userRepository: UserRepository,
        private readonly authService: AuthService,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[AdminService.${action}]`, error);
        throw CustomError.databaseError(`Database error on admin ${action}`);
    }


    // Alta manual de un cliente: crea usuario sin contraseña + empresa + membresía
    // y le envía el enlace para definir su contraseña.
    async createClient(dto: CreateClientDto, actorUserId: string): Promise<ClientAccount> {
        try {
            const exists = await this.userRepository.findByEmail(dto.email);
            if (exists) throw CustomError.badRequest('User with this email already exists');

            // El sufijo aleatorio evita colisiones entre empresas con el mismo nombre
            const tenantSlug = `${slugify(dto.tenantName)}-${randomBytes(3).toString("hex")}`;

            const account = await this.adminRepository.createClientAccount({
                email: dto.email,
                tenantName: dto.tenantName,
                tenantSlug,
            });

            await this.auditService.record({
                actorUserId,
                tenantId: account.tenantId,
                action: AuditAction.ADMIN_CLIENT_CREATE,
                resourceType: 'tenant',
                resourceId: account.tenantId,
                result: 'SUCCESS',
                metadata: { userId: account.user.id },
            });

            // La cuenta ya existe: si el correo falla, el administrador debe saberlo
            // y reenviarlo, no volver a crear al cliente.
            try {
                await this.authService.sendAccountSetupEmail(account.user);
            } catch {
                throw CustomError.internalServerError(
                    `Account created (user id ${account.user.id}) but the setup email could not be sent. ` +
                    `Retry with POST /admin/users/${account.user.id}/setup-email`,
                );
            }
            return account;
        } catch (error) {
            this.handleError(error, 'createClient');
        }
    }

    // Reenvía el enlace (p. ej. si caducó a las 72 h). Solo para cuentas sin contraseña.
    async resendSetupEmail(userId: string): Promise<void> {
        try {
            const user = await this.userRepository.findById(userId);
            if (!user) throw CustomError.notFound('User not found');
            if (user.passwordHash) throw CustomError.badRequest('User already has a password');

            await this.authService.sendAccountSetupEmail(user);
        } catch (error) {
            this.handleError(error, 'resendSetupEmail');
        }
    }

}
