import type {
    ConnectionCheckResult,
    ConnectionCredentials,
    SaveConnectionInput,
    WhatsappConnectionInfo,
} from "../entities/whatsapp-connection.entity";

export abstract class WhatsappConnectionRepository {
    abstract findByTenant(tenantId: string): Promise<WhatsappConnectionInfo | null>;

    abstract findCredentials(tenantId: string): Promise<ConnectionCredentials | null>;

    abstract save(
        tenantId: string,
        input: SaveConnectionInput,
    ): Promise<{ connection: WhatsappConnectionInfo; replaced: boolean }>;

    abstract recordCheck(connectionId: string, result: ConnectionCheckResult): Promise<WhatsappConnectionInfo>;

    abstract disconnect(connectionId: string): Promise<WhatsappConnectionInfo>;
}
