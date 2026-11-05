import type { ClientAccount, NewClientAccountData } from "../datasources/admin.datasource";


export abstract class AdminRepository {
    abstract createClientAccount(data: NewClientAccountData): Promise<ClientAccount>;
}
