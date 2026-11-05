import type { NewUserData, UserEntity } from "../entities/user.entity";



export abstract class UserDatasource {
    abstract create(data: NewUserData): Promise<UserEntity>;

    abstract getAll(): Promise<UserEntity[]>;

    abstract findById(id: string): Promise<UserEntity | null>;

    abstract findByEmail(email: string): Promise<UserEntity | null>;

}