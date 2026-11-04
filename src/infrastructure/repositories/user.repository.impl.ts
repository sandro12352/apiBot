import type { CreateUserDto, UserDatasource, UserEntity, UserRepository } from "../../domain";


export class UserRepositoryImpl implements UserRepository {
    constructor(private readonly userDatasource: UserDatasource) {}

    create(createUserDto: CreateUserDto): Promise<UserEntity> {
        throw new Error("Method not implemented.");
    }
    getAll(): Promise<UserEntity[]> {
        return this.userDatasource.getAll();
    }
    findById(id: string): Promise<UserEntity | null> {
        throw new Error("Method not implemented.");
    }
    findByEmail(email: string): Promise<UserEntity | null> {
        throw new Error("Method not implemented.");
    }

}