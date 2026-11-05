import type { UserEntity } from "../entities/user.entity";

export interface NewClientAccountData {
    email: string;
    tenantName: string;
    tenantSlug: string;
}

export interface ClientAccount {
    user: UserEntity;
    tenantId: string;
    tenantSlug: string;
}


export abstract class AdminDatasource {
    // Crea en una sola transacción: usuario (sin contraseña), empresa y membresía TENANT_ADMIN
    abstract createClientAccount(data: NewClientAccountData): Promise<ClientAccount>;
}
