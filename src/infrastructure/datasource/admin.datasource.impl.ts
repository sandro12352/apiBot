import { prisma } from "../../data/postgres";
import {
    AdminDatasource,
    UserEntity,
    type ClientAccount,
    type NewClientAccountData,
} from "../../domain";

export class AdminDatasourceImpl extends AdminDatasource {

    async createClientAccount(data: NewClientAccountData): Promise<ClientAccount> {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.create({ data: { email: data.email } });
            const tenant = await tx.tenant.create({
                data: { name: data.tenantName, slug: data.tenantSlug },
            });
            await tx.tenantMembership.create({
                data: { tenantId: tenant.id, userId: user.id, role: "TENANT_ADMIN" },
            });

            return {
                user: UserEntity.fromObject(user),
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
            };
        });
    }
}
