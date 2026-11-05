import type { PasswordHasher } from "../../config/adapters/password-hasher";
import type { CreateUserDto } from "../dtos/create-user.dto";
import type { UpdateUserDto } from "../dtos/update-user.dto";
import type { UserEntity } from "../entities/user.entity";
import { CustomError } from "../errors/custom.error";
import type { UserRepository } from "../repositories/user.repository";


export class UserService {

    constructor(
        private readonly userRepository: UserRepository,
        private readonly passwordHasher: PasswordHasher,
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

    async getAll(): Promise<UserEntity[]> {
        try {
            return await this.userRepository.getAll();
        } catch (error) {
            this.handleError(error, 'getAll');
        }
    }

    async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity> {
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

            return await this.userRepository.update(id, {
                email: updateUserDto.email,
                passwordHash,
            });
        } catch (error) {
            this.handleError(error, 'update');
        }
    }

    async delete(id: string): Promise<void> {
        try {
            const userExist = await this.userRepository.findById(id);
            if (!userExist) throw CustomError.notFound('User not found');
            await this.userRepository.delete(id);
        } catch (error) {
            this.handleError(error, 'delete');
        }
    }

}
