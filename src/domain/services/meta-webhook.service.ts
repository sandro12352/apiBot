import { createHmac, timingSafeEqual } from "node:crypto";
import type { Encryptor } from "../../config/adapters/encryptor";
import type { WhatsAppSender } from "../../config/adapters/whatsapp-sender";
import type { MetaWebhookDto } from "../dtos/meta-webhook.dto";
import type { PendingJob, WebhookConnection } from "../entities/meta-webhook.entity";
import type { MetaWebhookRepository } from "../repositories/meta-webhook.repository";
import type { InboundMessageHandler } from "./inbound-message.handler";

export interface MetaWebhookOptions {
    appSecret?: string | undefined;
    verifyToken?: string | undefined;
}

// Tope de reintentos de un mismo evento. Meta reintenta hasta 7 días: sin tope un evento roto
// se procesaría para siempre.
const MAX_ATTEMPTS = 3;

const safeEqual = (a: string, b: string): boolean => {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
};

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

export class MetaWebhookService {
    constructor(
        private readonly repository: MetaWebhookRepository,
        private readonly sender: WhatsAppSender,
        private readonly handler: InboundMessageHandler,
        private readonly encryptor: Encryptor,
        private readonly options: MetaWebhookOptions,
    ) {}

    // GET de verificación: devuelve el challenge si el token coincide, o null
    verifyChallenge(mode: string, token: string, challenge: string): string | null {
        const expected = this.options.verifyToken;
        if (!expected || mode !== "subscribe" || !safeEqual(token, expected)) return null;
        return challenge;
    }

    // Firma sobre el body CRUDO (no sobre el JSON ya parseado): HMAC-SHA256 con el App Secret
    verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
        const secret = this.options.appSecret;
        if (!secret || !rawBody || !header?.startsWith("sha256=")) return false;
        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        return safeEqual(header.slice("sha256=".length), expected);
    }

    // Guarda cada evento ANTES de responder a Meta y devuelve lo que queda por procesar.
    // Los duplicados se descartan, salvo los que quedaron sin terminar (RECEIVED/FAILED)
    // y aún tienen reintentos: así un reintento de Meta puede completar un evento caído.
    async ingest(dto: MetaWebhookDto): Promise<PendingJob[]> {
        const connections = new Map<string, WebhookConnection | null>();
        const jobs: PendingJob[] = [];

        for (const event of dto.events) {
            if (!connections.has(event.phoneNumberId)) {
                connections.set(
                    event.phoneNumberId,
                    await this.repository.findConnectionByPhoneNumberId(event.phoneNumberId),
                );
            }
            const connection = connections.get(event.phoneNumberId) ?? null;

            const registered = await this.repository.registerEvent({
                externalId: event.externalId,
                type: event.kind,
                ...(connection ? { tenantId: connection.tenantId, connectionId: connection.id } : {}),
            });

            const unfinished = registered.status === "RECEIVED" || registered.status === "FAILED";
            if (!registered.isNew && !(unfinished && registered.attempts < MAX_ATTEMPTS)) continue;

            // Sin conexión conocida, o solo un estado de entrega: queda registrado y nada más
            if (!connection || event.kind === "status") {
                await this.repository.finishEvent(registered.id, "IGNORED");
                continue;
            }

            jobs.push({ eventId: registered.id, connection, event });
        }

        return jobs;
    }

    // Se ejecuta después de responder 200. Nunca lanza: cada fallo queda en el estado del evento.
    async process(jobs: PendingJob[]): Promise<void> {
        for (const job of jobs) {
            await this.processJob(job).catch((error: unknown) => {
                console.error("[MetaWebhook] Unexpected error while processing event", job.eventId, error instanceof Error ? error.name : "unknown");
            });
        }
    }

    private async processJob(job: PendingJob): Promise<void> {
        const { eventId, connection, event } = job;
        if (event.kind !== "message") return;

        await this.repository.startEvent(eventId);
        let messageStateId: string | undefined;

        try {
            if (!(await this.canRespond(connection, event.from))) {
                await this.repository.finishEvent(eventId, "IGNORED");
                return;
            }

            // Por ahora solo texto; imágenes, documentos y audio llegan en la fase multimodal
            if (event.messageType !== "text" || !event.text) {
                await this.repository.finishEvent(eventId, "IGNORED");
                return;
            }

            const claim = await this.repository.claimMessage({
                tenantId: connection.tenantId,
                connectionId: connection.id,
                externalMessageId: event.externalId,
                idempotencyKey: `${connection.id}:${event.externalId}`,
            });
            if (!claim.claimed) {
                await this.repository.finishEvent(eventId, "PROCESSED");
                return;
            }
            messageStateId = claim.id;

            const reply = await this.handler.handle({
                tenantId: connection.tenantId,
                connectionId: connection.id,
                from: event.from,
                text: event.text,
            });
            if (reply === null) {
                await this.repository.finishEvent(eventId, "IGNORED");
                return;
            }

            if (!connection.encryptedAccessToken) throw new Error("Connection has no access token");

            await this.sender.sendText({
                phoneNumberId: connection.phoneNumberId,
                to: event.from,
                body: reply,
                accessToken: this.encryptor.decrypt(connection.encryptedAccessToken),
            });

            if (messageStateId) await this.repository.markMessageSent(messageStateId);
            await this.repository.finishEvent(eventId, "PROCESSED");
        } catch (error) {
            // Solo el mensaje del error: nunca el token ni el contenido del mensaje
            const detail = (error instanceof Error ? error.message : "Unknown error").slice(0, 300);
            if (messageStateId) await this.repository.markMessageFailed(messageStateId, detail);
            await this.repository.finishEvent(eventId, "FAILED", detail);
        }
    }

    // Conexión activa, empresa activa y, en modo prueba, solo números autorizados
    private async canRespond(connection: WebhookConnection, from: string): Promise<boolean> {
        const { tenant } = connection;
        if (connection.status !== "CONNECTED" || !connection.botEnabled) return false;
        if (tenant.status !== "ACTIVE" || !tenant.botEnabled) return false;
        if (tenant.botMode === "TEST") {
            return this.repository.isTestNumber(connection.tenantId, digitsOnly(from));
        }
        return true;
    }
}
