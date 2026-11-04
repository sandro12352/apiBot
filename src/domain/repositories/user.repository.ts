import { UserEntity } from "../entities/user.entity";
import { CreateUserDto } from "../dtos/create-user.dto";


export abstract class UserRepository {
    abstract create(createUserDto: CreateUserDto): Promise<UserEntity>;

    abstract getAll(): Promise<UserEntity[]>;

    abstract findById(id: string): Promise<UserEntity | null>;

    abstract findByEmail(email: string): Promise<UserEntity | null>;

}