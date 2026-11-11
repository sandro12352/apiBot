import { prisma } from "../../data/postgres";
import {
    WhatsappConnectionDatasource,
    type ConnectionCheckResult,
    type ConnectionCredentials,
    type SaveConnectionInput,
    type WhatsappConnectionInfo,
    type WhatsappConnectionState,
} from "../../domain";

type Row = {
    id: string;
    status: string;
    statusDetail: string | null;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string | null;
    botEnabled: boolean;
    encryptedAccessToken: string | null;
    lastConnectionTestAt: Date | null;
    lastConnectionTestOk: boolean | null;
    connectedAt: Date | null;
    disconnectedAt: Date | null;
};

const toInfo = (row: Row): WhatsappConnectionInfo => ({
    id: row.id,
    status: row.status as WhatsappConnectionState,
    statusDetail: row.statusDetail,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    botEnabled: row.botEnabled,
    // El token nunca sale de la capa de persistencia: solo se informa de si existe
    hasToken: row.encryptedAccessToken !== null,
    lastConnectionTestAt: row.lastConnectionTestAt,
    lastConnectionTestOk: row.lastConnectionTestOk,
    connectedAt: row.connectedAt,
    disconnectedAt: row.disconnectedAt,
});

// Una empresa tiene una conexión en el MVP: se toma la más antigua
const ofTenant = (tenantId: string) => ({ where: { tenantId }, orderBy: { createdAt: "asc" as const } });

export class WhatsappConnectionDatasourceImpl extends WhatsappConnectionDatasource {

    async findByTenant(tenantId: string): Promise<WhatsappConnectionInfo | null> {
        const row = await prisma.whatsappConnection.findFirst(ofTenant(tenantId));
        return row ? toInfo(row) : null;
    }

    async findCredentials(tenantId: string): Promise<ConnectionCredentials | null> {
        const row = await prisma.whatsappConnection.findFirst({
            ...ofTenant(tenantId),
            select: { id: true, status: true, phoneNumberId: true, encryptedAccessToken: true },
        });
        return row ? { ...row, status: row.status as WhatsappConnectionState } : null;
    }

    async save(
        tenantId: string,
        input: SaveConnectionInput,
    ): Promise<{ connection: WhatsappConnectionInfo; replaced: boolean }> {
        const now = new Date();
        const data = {
            wabaId: input.wabaId,
            phoneNumberId: input.phoneNumberId,
            displayPhoneNumber: input.displayPhoneNumber,
            encryptedAccessToken: input.encryptedAccessToken,
            status: "CONNECTED" as const,
            statusDetail: null,
            tokenExpiresAt: null,
            connectedAt: now,
            disconnectedAt: null,
            lastConnectionTestAt: now,
            lastConnectionTestOk: true,
        };

        const existing = await prisma.whatsappConnection.findFirst({ ...ofTenant(tenantId), select: { id: true } });
        const row = existing
            ? await prisma.whatsappConnection.update({ where: { id: existing.id }, data })
            : await prisma.whatsappConnection.create({ data: { tenantId, ...data } });

        return { connection: toInfo(row), replaced: existing !== null };
    }

    async recordCheck(connectionId: string, result: ConnectionCheckResult): Promise<WhatsappConnectionInfo> {
        const row = await prisma.whatsappConnection.update({
            where: { id: connectionId },
            data: {
                lastConnectionTestAt: new Date(),
                lastConnectionTestOk: result.ok,
                statusDetail: result.detail,
                ...(result.status ? { status: result.status } : {}),
                ...(result.displayPhoneNumber ? { displayPhoneNumber: result.displayPhoneNumber } : {}),
            },
        });
        return toInfo(row);
    }

    async disconnect(connectionId: string): Promise<WhatsappConnectionInfo> {
        const row = await prisma.whatsappConnection.update({
            where: { id: connectionId },
            data: {
                status: "DISCONNECTED",
                statusDetail: null,
                encryptedAccessToken: null,
                tokenExpiresAt: null,
                disconnectedAt: new Date(),
            },
        });
        return toInfo(row);
    }
}
