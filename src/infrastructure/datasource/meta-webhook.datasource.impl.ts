import { prisma } from "../../data/postgres";
import {
    MetaWebhookDatasource,
    type ClaimedMessage,
    type ClaimMessageInput,
    type EventStatus,
    type RegisteredEvent,
    type TenantBotMode,
    type WebhookConnection,
} from "../../domain";

// Mensaje en PROCESSING reciente: otro proceso lo está atendiendo; no responder dos veces
const IN_FLIGHT_MS = 60_000;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export class MetaWebhookDatasourceImpl extends MetaWebhookDatasource {

    async findConnectionByPhoneNumberId(phoneNumberId: string): Promise<WebhookConnection | null> {
        const connection = await prisma.whatsappConnection.findUnique({
            where: { phoneNumberId },
            include: { tenant: { select: { status: true, botEnabled: true, botMode: true } } },
        });
        if (!connection) return null;

        return {
            id: connection.id,
            tenantId: connection.tenantId,
            status: connection.status,
            botEnabled: connection.botEnabled,
            phoneNumberId: connection.phoneNumberId,
            encryptedAccessToken: connection.encryptedAccessToken,
            tenant: {
                status: connection.tenant.status,
                botEnabled: connection.tenant.botEnabled,
                botMode: connection.tenant.botMode as TenantBotMode,
            },
        };
    }

    async registerEvent(input: {
        externalId: string;
        type: string;
        tenantId?: string;
        connectionId?: string;
    }): Promise<RegisteredEvent> {
        try {
            const created = await prisma.webhookEvent.create({
                data: {
                    externalId: input.externalId,
                    type: input.type,
                    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
                    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
                },
            });
            return { id: created.id, isNew: true, status: created.status, attempts: created.attempts };
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;

            const existing = await prisma.webhookEvent.findUnique({
                where: { externalId_type: { externalId: input.externalId, type: input.type } },
            });
            if (!existing) throw error;
            return { id: existing.id, isNew: false, status: existing.status, attempts: existing.attempts };
        }
    }

    async startEvent(eventId: string): Promise<void> {
        await prisma.webhookEvent.update({
            where: { id: eventId },
            data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
        });
    }

    async finishEvent(eventId: string, status: EventStatus, lastError?: string): Promise<void> {
        await prisma.webhookEvent.update({
            where: { id: eventId },
            data: { status, lastError: lastError ?? null, processedAt: new Date() },
        });
    }

    async isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean> {
        // La lista de números de prueba de una empresa es corta; se normaliza en memoria
        const numbers = await prisma.testNumber.findMany({
            where: { tenantId },
            select: { phoneNumber: true },
        });
        return numbers.some((row) => row.phoneNumber.replace(/\D/g, "") === phoneDigits);
    }

    async claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage> {
        try {
            const created = await prisma.messageProcessingState.create({
                data: { ...input, status: "PROCESSING", attempts: 1 },
            });
            return { claimed: true, id: created.id };
        } catch (error) {
            if (!isUniqueViolation(error)) throw error;
        }

        const existing = await prisma.messageProcessingState.findUnique({
            where: {
                connectionId_externalMessageId: {
                    connectionId: input.connectionId,
                    externalMessageId: input.externalMessageId,
                },
            },
        });
        if (!existing || existing.responseSentAt) return { claimed: false };

        const inFlight =
            existing.status === "PROCESSING" && Date.now() - existing.updatedAt.getTime() < IN_FLIGHT_MS;
        if (inFlight) return { claimed: false };

        await prisma.messageProcessingState.update({
            where: { id: existing.id },
            data: { status: "PROCESSING", attempts: { increment: 1 }, lastError: null },
        });
        return { claimed: true, id: existing.id };
    }

    async markMessageSent(messageStateId: string): Promise<void> {
        await prisma.messageProcessingState.update({
            where: { id: messageStateId },
            data: { status: "PROCESSED", responseSentAt: new Date() },
        });
    }

    async markMessageFailed(messageStateId: string, lastError: string): Promise<void> {
        await prisma.messageProcessingState.update({
            where: { id: messageStateId },
            data: { status: "FAILED", lastError },
        });
    }
}
