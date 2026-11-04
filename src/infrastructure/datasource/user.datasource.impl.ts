import { prisma } from "../../data/postgres";
import { CreateUserDto, UserDatasource, UserEntity } from "../../domain";

export class UserDatasourceImpl extends UserDatasource {

    create(createUserDto: CreateUserDto): Promise<UserEntity> {
        throw new Error("Method not implemented.");
    }

    async getAll(): Promise<UserEntity[]> {
        const users = await prisma.user.findMany();
        return users.map(user => UserEntity.fromObject(user));
        
    }

    async findById(id: string): Promise<UserEntity | null> {
        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) throw 'User not found';
        return UserEntity.fromObject(user);
    }

    findByEmail(email: string): Promise<UserEntity | null> {
        throw new Error("Method not implemented.");
    }


}