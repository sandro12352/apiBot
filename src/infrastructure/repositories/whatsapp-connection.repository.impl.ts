import type {
    ConnectionCheckResult,
    ConnectionCredentials,
    SaveConnectionInput,
    WhatsappConnectionDatasource,
    WhatsappConnectionInfo,
    WhatsappConnectionRepository,
} from "../../domain";

export class WhatsappConnectionRepositoryImpl implements WhatsappConnectionRepository {
    constructor(private readonly datasource: WhatsappConnectionDatasource) {}

    findByTenant(tenantId: string): Promise<WhatsappConnectionInfo | null> {
        return this.datasource.findByTenant(tenantId);
    }

    findCredentials(tenantId: string): Promise<ConnectionCredentials | null> {
        return this.datasource.findCredentials(tenantId);
    }

    save(
        tenantId: string,
        input: SaveConnectionInput,
    ): Promise<{ connection: WhatsappConnectionInfo; replaced: boolean }> {
        return this.datasource.save(tenantId, input);
    }

    recordCheck(connectionId: string, result: ConnectionCheckResult): Promise<WhatsappConnectionInfo> {
        return this.datasource.recordCheck(connectionId, result);
    }

    disconnect(connectionId: string): Promise<WhatsappConnectionInfo> {
        return this.datasource.disconnect(connectionId);
    }
}
