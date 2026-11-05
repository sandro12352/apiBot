import type { NewUserData, UpdateUserData, UserEntity } from "../entities/user.entity";



export abstract class UserDatasource {
    abstract create(data: NewUserData): Promise<UserEntity>;

    abstract getAll(): Promise<UserEntity[]>;

    abstract findById(id: string): Promise<UserEntity | null>;

    abstract findByEmail(email: string): Promise<UserEntity | null>;

    abstract update(id: string, data: UpdateUserData): Promise<UserEntity>;

    abstract delete(id: string): Promise<void>;

}