import type { NewUserData, UserDatasource, UserEntity, UserRepository } from "../../domain";


export class UserRepositoryImpl implements UserRepository {
    constructor(private readonly userDatasource: UserDatasource) {}

    create(data: NewUserData): Promise<UserEntity> {
        return this.userDatasource.create(data);
    }

    getAll(): Promise<UserEntity[]> {
        return this.userDatasource.getAll();
    }

    findById(id: string): Promise<UserEntity | null> {
        return this.userDatasource.findById(id);
    }

    findByEmail(email: string): Promise<UserEntity | null> {
        return this.userDatasource.findByEmail(email);
    }

}
