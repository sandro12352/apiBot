import type { PasswordHasher } from "../../config/adapters/password-hasher";
import type { CreateUserDto } from "../dtos/create-user.dto";
import type { UserEntity } from "../entities/user.entity";
import { CustomError } from "../errors/custom.error";
import type { UserRepository } from "../repositories/user.repository";


export class UserService {

    constructor(
        private readonly userRepository: UserRepository,
        private readonly passwordHasher: PasswordHasher,
    ) {}


    async create(createUserDto: CreateUserDto): Promise<UserEntity> {
        const userExists = await this.userRepository.findByEmail(createUserDto.email);
        if (userExists) throw CustomError.badRequest('User with this email already exists');

        const passwordHash = await this.passwordHasher.hash(createUserDto.password);
        const now = new Date();

        return this.userRepository.create({
            email: createUserDto.email,
            passwordHash,
            privacyAcceptedAt: now,
            termsAcceptedAt: now,
        });
    }

    async getAll(): Promise<UserEntity[]> {
        return this.userRepository.getAll();
    }

    async delete(id: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

}
