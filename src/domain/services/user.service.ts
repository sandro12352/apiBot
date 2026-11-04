import type { CreateUserDto } from "../dtos/create-user.dto";
import type { UserEntity } from "../entities/user.entity";
import type { UserRepository } from "../repositories/user.repository";


export class UserService {

    constructor(
        private readonly userRepository: UserRepository,
    ) {}


    async create(createUserDto: CreateUserDto): Promise<UserEntity> {
        throw new Error("Method not implemented.");
    }

    async getAll(): Promise<UserEntity[]> {
        throw new Error("Method not implemented.");
    }

    async delete(id: string): Promise<void> {
        throw new Error("Method not implemented.");
    }

}
