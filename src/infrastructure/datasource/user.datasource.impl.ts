import { prisma } from "../../data/postgres";
import { type NewUserData, UserDatasource, UserEntity } from "../../domain";

export class UserDatasourceImpl extends UserDatasource {

    async create(data: NewUserData): Promise<UserEntity> {
        const user = await prisma.user.create({
            data: {
                email: data.email,
                passwordHash: data.passwordHash,
                privacyAcceptedAt: data.privacyAcceptedAt,
                termsAcceptedAt: data.termsAcceptedAt,
            },
        });
        return UserEntity.fromObject(user);
    }

    async getAll(): Promise<UserEntity[]> {
        const users = await prisma.user.findMany();
        return users.map(user => UserEntity.fromObject(user));
    }

    async findById(id: string): Promise<UserEntity | null> {
        const user = await prisma.user.findUnique({ where: { id } });
        return user ? UserEntity.fromObject(user) : null;
    }

    async findByEmail(email: string): Promise<UserEntity | null> {
        const user = await prisma.user.findUnique({ where: { email } });
        return user ? UserEntity.fromObject(user) : null;
    }

}
