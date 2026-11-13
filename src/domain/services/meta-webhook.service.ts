import { createHmac, timingSafeEqual } from "node:crypto";
import type { Encryptor } from "../../config/adapters/encryptor";
import { WhatsAppApiError } from "../../config/adapters/whatsapp-account";
import type { WhatsAppSender } from "../../config/adapters/whatsapp-sender";
import type { MetaWebhookDto } from "../dtos/meta-webhook.dto";
import { AuditAction } from "../entities/audit.entity";
import type {
    InboundAccountEvent,
    InboundMessageEvent,
    PendingJob,
    WebhookConnection,
} from "../entities/meta-webhook.entity";
import type { WhatsappConnectionState } from "../entities/whatsapp-connection.entity";
import type { MetaWebhookRepository } from "../repositories/meta-webhook.repository";
import type { AuditService } from "./audit.service";
import { ReplySkipped, type InboundMessageHandler } from "./inbound-message.handler";

export interface MetaWebhookOptions {
    appSecret?: string | undefined;
    verifyToken?: string | undefined;
}

// Tope de intentos de un mismo evento. Meta reintenta hasta 7 días: sin tope un evento roto
// se procesaría para siempre.
const MAX_ATTEMPTS = 3;

// Espera antes del siguiente intento, según los intentos ya hechos (1.º y 2.º; el 3.º es el último)
const RETRY_DELAYS_MS = [60_000, 5 * 60_000];

const REPROCESS_BATCH = 25;

// Fallo de credenciales propias (token ausente o ilegible): reintentar no lo arregla
class ConnectionCredentialError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConnectionCredentialError";
    }
}

interface ConnectionChange {
    status?: WhatsappConnectionState;
    detail: string;
}

type StatusChange = ConnectionChange & { status: WhatsappConnectionState };

const safeEqual = (a: string, b: string): boolean => {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
};

const digitsOnly = (value: string): string => value.replace(/\D/g, "");

// Eventos de la cuenta que cambian el estado de la conexión. Solo los que indican una baja o
// desactivación clara cambian el estado; los avisos (violación, restricción) solo dejan constancia.
const accountChange = (event: InboundAccountEvent): ConnectionChange | null => {
    switch (event.event) {
        case "DISABLED_UPDATE":
            return { status: "NOT_ELIGIBLE", detail: "WhatsApp account disabled by Meta (DISABLED_UPDATE)" };
        case "PARTNER_REMOVED":
            return { status: "DISCONNECTED", detail: `Access removed (${event.reason ?? "PARTNER_REMOVED"})` };
        case "ACCOUNT_OFFBOARDED":
            return { status: "DISCONNECTED", detail: "Account offboarded (device change or re-registration)" };
        case "ACCOUNT_VIOLATION":
        case "ACCOUNT_RESTRICTION":
            return { detail: `Meta reported ${event.event}` };
        default:
            return null;
    }
};

export class MetaWebhookService {
    constructor(
        private readonly repository: MetaWebhookRepository,
        private readonly sender: WhatsAppSender,
        private readonly handler: InboundMessageHandler,
        private readonly encryptor: Encryptor,
        private readonly auditService: AuditService,
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
            if (event.kind === "account") {
                const registered = await this.repository.registerEvent({ externalId: event.externalId, type: "account" });
                // Un evento de cuenta repetido ya se aplicó: no se reprocesa
                if (registered.isNew) jobs.push({ eventId: registered.id, event });
                continue;
            }

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
                // El contenido se guarda cifrado solo mientras pueda hacer falta reprocesarlo
                ...(connection && event.kind === "message"
                    ? { encryptedPayload: this.encryptor.encrypt(JSON.stringify(event)) }
                    : {}),
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
            const run = "connection" in job ? this.processMessage(job) : this.processAccountEvent(job);
            await run.catch((error: unknown) => {
                console.error("[MetaWebhook] Unexpected error while processing event", job.eventId, error instanceof Error ? error.name : "unknown");
            });
        }
    }

    // Reintenta los mensajes fallidos o sin terminar cuya hora de reintento ya llegó.
    // Lo llama el reprocesador periódico (y al arrancar). Devuelve cuántos reprocesó.
    async reprocessPending(now: Date = new Date()): Promise<number> {
        await this.repository.expireExhausted(now, MAX_ATTEMPTS);
        const pending = await this.repository.findRetryable(now, MAX_ATTEMPTS, REPROCESS_BATCH);

        let reprocessed = 0;
        for (const row of pending) {
            const event = this.readPayload(row.encryptedPayload);
            if (!event) {
                await this.repository.finishEvent(row.id, "FAILED", "Stored event could not be read");
                continue;
            }

            // Se lee la conexión actual: si ya no está activa, el mensaje se descarta sin responder
            const connection = await this.repository.findConnectionByPhoneNumberId(event.phoneNumberId);
            if (!connection) {
                await this.repository.finishEvent(row.id, "IGNORED");
                continue;
            }

            await this.process([{ eventId: row.id, connection, event }]);
            reprocessed++;
        }
        return reprocessed;
    }

    private readPayload(encrypted: string): InboundMessageEvent | null {
        try {
            const data = JSON.parse(this.encryptor.decrypt(encrypted)) as Partial<InboundMessageEvent>;
            const valid =
                data.kind === "message" &&
                typeof data.phoneNumberId === "string" &&
                typeof data.externalId === "string" &&
                typeof data.from === "string" &&
                typeof data.messageType === "string";
            return valid ? (data as InboundMessageEvent) : null;
        } catch {
            return null;
        }
    }

    private async processMessage(job: Extract<PendingJob, { connection: WebhookConnection }>): Promise<void> {
        const { eventId, connection, event } = job;

        const attempts = await this.repository.startEvent(eventId);
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

            const inbound = {
                tenantId: connection.tenantId,
                connectionId: connection.id,
                from: event.from,
                text: event.text,
                isTest: connection.tenant.botMode === "TEST",
            };
            let reply: string | null;
            try {
                reply = await this.handler.handle(inbound);
            } catch (error) {
                if (!(error instanceof ReplySkipped)) throw error;
                await this.repository.finishEvent(eventId, "IGNORED", error.reason.slice(0, 300));
                return;
            }
            if (reply === null) {
                await this.repository.finishEvent(eventId, "IGNORED");
                return;
            }

            if (!connection.encryptedAccessToken) {
                throw new ConnectionCredentialError("Connection has no access token");
            }
            let accessToken: string;
            try {
                accessToken = this.encryptor.decrypt(connection.encryptedAccessToken);
            } catch {
                throw new ConnectionCredentialError("The stored access token could not be read");
            }

            await this.sender.sendText({
                phoneNumberId: connection.phoneNumberId,
                to: event.from,
                body: reply,
                accessToken,
            });

            if (messageStateId) await this.repository.markMessageSent(messageStateId);
            await this.repository.finishEvent(eventId, "PROCESSED");

            // La respuesta ya salió: guardar el contexto es secundario y su fallo no la revierte
            await this.handler.afterSent(inbound, reply).catch((error: unknown) => {
                console.error("[MetaWebhook] afterSent failed", error instanceof Error ? error.name : "unknown");
            });
        } catch (error) {
            // Solo el mensaje del error: nunca el token ni el contenido del mensaje
            const detail = (error instanceof Error ? error.message : "Unknown error").slice(0, 300);
            if (messageStateId) await this.repository.markMessageFailed(messageStateId, detail);

            const retry = await this.handleSendFailure(connection, error);
            const delay = RETRY_DELAYS_MS[attempts - 1];
            const retryAt = retry && attempts < MAX_ATTEMPTS && delay !== undefined ? new Date(Date.now() + delay) : undefined;
            await this.repository.finishEvent(eventId, "FAILED", detail, retryAt);
        }
    }

    // Según el motivo del rechazo de Meta, marca la conexión y decide si merece otro intento
    private async handleSendFailure(connection: WebhookConnection, error: unknown): Promise<boolean> {
        if (error instanceof ConnectionCredentialError) {
            await this.changeConnection(connection, { status: "ERROR", detail: error.message });
            return false;
        }
        // Error desconocido (no de Meta): se trata como temporal
        if (!(error instanceof WhatsAppApiError)) return true;

        let change: StatusChange | undefined;
        if (error.isInvalidToken) {
            change = { status: "TOKEN_EXPIRED", detail: "The access token is invalid, expired or revoked" };
        } else if (error.isAccountNotEligible) {
            change = { status: "NOT_ELIGIBLE", detail: `The WhatsApp account or number cannot send messages (code ${error.metaCode})` };
        } else if (error.isPermissionError) {
            change = { status: "ERROR", detail: "The access token lacks the required permissions" };
        }
        if (change) {
            await this.changeConnection(connection, change);
            return false;
        }

        // Problema de ese destinatario: la conexión está bien y reintentar no cambia nada
        if (error.isRecipientError) return false;
        // Solo lo temporal se reintenta; otro rechazo 4xx no se arregla solo
        return error.isTemporary;
    }

    private async changeConnection(connection: WebhookConnection, change: StatusChange): Promise<void> {
        const changed = await this.repository.markConnectionStatus(connection.id, change.status, change.detail);
        if (!changed) return;
        await this.auditService.record({
            actorUserId: null,
            tenantId: connection.tenantId,
            action: AuditAction.WHATSAPP_CONNECTION_STATUS,
            resourceType: "whatsapp_connection",
            resourceId: connection.id,
            result: "FAILURE",
            metadata: { status: change.status },
        });
    }

    private async processAccountEvent(job: Extract<PendingJob, { event: InboundAccountEvent }> & { connection?: undefined }): Promise<void> {
        const { eventId, event } = job;
        const change = accountChange(event);
        if (!change) {
            await this.repository.finishEvent(eventId, "IGNORED");
            return;
        }

        const affected = await this.repository.applyAccountEvent(event.wabaId, change);
        for (const item of affected) {
            await this.auditService.record({
                actorUserId: null,
                tenantId: item.tenantId,
                action: AuditAction.WHATSAPP_CONNECTION_STATUS,
                resourceType: "whatsapp_connection",
                resourceId: item.connectionId,
                result: "FAILURE",
                metadata: { event: event.event, ...(change.status ? { status: change.status } : {}) },
            });
        }
        await this.repository.finishEvent(eventId, affected.length > 0 ? "PROCESSED" : "IGNORED");
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
