import type {
    ConnectionCheckResult,
    ConnectionCredentials,
    SaveConnectionInput,
    WhatsappConnectionInfo,
} from "../entities/whatsapp-connection.entity";

export abstract class WhatsappConnectionDatasource {
    abstract findByTenant(tenantId: string): Promise<WhatsappConnectionInfo | null>;

    abstract findCredentials(tenantId: string): Promise<ConnectionCredentials | null>;

    // Crea la conexión de la empresa o reemplaza sus credenciales; la deja CONNECTED.
    // Lanza la violación de unicidad de Prisma (P2002) si el número ya es de otra empresa.
    abstract save(
        tenantId: string,
        input: SaveConnectionInput,
    ): Promise<{ connection: WhatsappConnectionInfo; replaced: boolean }>;

    abstract recordCheck(connectionId: string, result: ConnectionCheckResult): Promise<WhatsappConnectionInfo>;

    // Borra el token cifrado y marca la conexión como DISCONNECTED
    abstract disconnect(connectionId: string): Promise<WhatsappConnectionInfo>;
}
