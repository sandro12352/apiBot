import type { PasswordHasher } from "../../config/adapters/password-hasher";
import type { CreateUserDto } from "../dtos/create-user.dto";
import type { UpdateUserDto } from "../dtos/update-user.dto";
import { AuditAction } from "../entities/audit.entity";
import type { UserEntity } from "../entities/user.entity";
import { CustomError } from "../errors/custom.error";
import type { UserRepository } from "../repositories/user.repository";
import type { AuditService } from "./audit.service";


export class UserService {

    constructor(
        private readonly userRepository: UserRepository,
        private readonly passwordHasher: PasswordHasher,
        // Solo lo necesitan las operaciones de administración (update/delete)
        private readonly auditService?: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[UserService.${action}]`, error);
        throw CustomError.databaseError(`Database error on user ${action}`);
    }
    

    async create(createUserDto: CreateUserDto): Promise<UserEntity> {
        try {
            const userExists = await this.userRepository.findByEmail(createUserDto.email);
            if (userExists) throw CustomError.badRequest('User with this email already exists');

            const passwordHash = await this.passwordHasher.hash(createUserDto.password);
            const now = new Date();

            return await this.userRepository.create({
                email: createUserDto.email,
                passwordHash,
                privacyAcceptedAt: now,
                termsAcceptedAt: now,
            });
        } catch (error) {
            this.handleError(error, 'create');
        }
    }

    async getById(id: string): Promise<UserEntity> {
        try {
            const user = await this.userRepository.findById(id);
            if (!user) throw CustomError.notFound('User not found');
            return user;
        } catch (error) {
            this.handleError(error, 'getById');
        }
    }

    async getAll(): Promise<UserEntity[]> {
        try {
            return await this.userRepository.getAll();
        } catch (error) {
            this.handleError(error, 'getAll');
        }
    }

    async update(id: string, updateUserDto: UpdateUserDto, actorUserId: string): Promise<UserEntity> {
        try {
            const user = await this.userRepository.findById(id);
            if (!user) throw CustomError.notFound('User not found');

            if (updateUserDto.email && updateUserDto.email !== user.email) {
                const emailTaken = await this.userRepository.findByEmail(updateUserDto.email);
                if (emailTaken) throw CustomError.badRequest('User with this email already exists');
            }

            const passwordHash = updateUserDto.password
                ? await this.passwordHasher.hash(updateUserDto.password)
                : undefined;

            const updated = await this.userRepository.update(id, {
                email: updateUserDto.email,
                passwordHash,
            });
            await this.auditService?.record({
                actorUserId,
                tenantId: null,
                action: AuditAction.ADMIN_USER_UPDATE,
                resourceType: 'user',
                resourceId: id,
                result: 'SUCCESS',
                // Solo qué campos cambiaron, nunca sus valores
                metadata: { email: updateUserDto.email !== undefined, password: passwordHash !== undefined },
            });
            return updated;
        } catch (error) {
            this.handleError(error, 'update');
        }
    }

    async delete(id: string, actorUserId: string): Promise<void> {
        try {
            const userExist = await this.userRepository.findById(id);
            if (!userExist) throw CustomError.notFound('User not found');
            if (id === actorUserId) throw CustomError.badRequest('You cannot delete your own account');

            await this.userRepository.delete(id);
            await this.auditService?.record({
                actorUserId,
                tenantId: null,
                action: AuditAction.ADMIN_USER_DELETE,
                resourceType: 'user',
                resourceId: id,
                result: 'SUCCESS',
            });
        } catch (error) {
            this.handleError(error, 'delete');
        }
    }

}
