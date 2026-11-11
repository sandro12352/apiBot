import type { WhatsappConnectionState } from "../entities/whatsapp-connection.entity";
import type {
    AffectedConnection,
    ClaimedMessage,
    ClaimMessageInput,
    EventStatus,
    RegisteredEvent,
    RetryableEvent,
    WebhookConnection,
} from "../entities/meta-webhook.entity";

export abstract class MetaWebhookDatasource {
    abstract findConnectionByPhoneNumberId(phoneNumberId: string): Promise<WebhookConnection | null>;

    // Inserta el evento; si ya existía (mismo externalId y tipo) devuelve el existente con isNew=false
    abstract registerEvent(input: {
        externalId: string;
        type: string;
        tenantId?: string;
        connectionId?: string;
        // Evento cifrado para poder reprocesarlo; se borra al terminar sin reintentos pendientes
        encryptedPayload?: string;
    }): Promise<RegisteredEvent>;

    // Marca el evento como en proceso, suma un intento y devuelve el total de intentos
    abstract startEvent(eventId: string): Promise<number>;
    // retryAt: si se indica, el evento conserva su payload y el reprocesador lo retomará desde esa hora
    abstract finishEvent(eventId: string, status: EventStatus, lastError?: string, retryAt?: Date): Promise<void>;

    abstract findRetryable(now: Date, maxAttempts: number, limit: number): Promise<RetryableEvent[]>;
    // Cierra los eventos que se quedaron sin terminar (caída del servidor) y agotaron sus intentos
    abstract expireExhausted(now: Date, maxAttempts: number): Promise<void>;

    // Cambia el estado solo si la conexión sigue CONNECTED; true si hubo cambio
    abstract markConnectionStatus(
        connectionId: string,
        status: WhatsappConnectionState,
        detail: string,
    ): Promise<boolean>;
    // Aplica un evento de la cuenta a todas las conexiones de ese WABA que no estén ya desconectadas
    abstract applyAccountEvent(
        wabaId: string,
        change: { status?: WhatsappConnectionState; detail: string },
    ): Promise<AffectedConnection[]>;

    // `phoneDigits` viene solo con dígitos; la comparación ignora el "+" y los espacios guardados
    abstract isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean>;

    abstract claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage>;
    abstract markMessageSent(messageStateId: string): Promise<void>;
    abstract markMessageFailed(messageStateId: string, lastError: string): Promise<void>;
}
