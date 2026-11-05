import type { AdminDatasource, AdminRepository, ClientAccount, NewClientAccountData } from "../../domain";


export class AdminRepositoryImpl implements AdminRepository {
    constructor(private readonly adminDatasource: AdminDatasource) {}

    createClientAccount(data: NewClientAccountData): Promise<ClientAccount> {
        return this.adminDatasource.createClientAccount(data);
    }
}
