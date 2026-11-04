import { CreateUserDto, UserEntity, UserRepository } from "../../../domain";

export class UserService {

    constructor(){}

    public async createUser(createUserDto: CreateUserDto) {
        const existUser = await UserRepository
    }

}