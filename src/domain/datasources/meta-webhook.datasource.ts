import type {
    ClaimedMessage,
    ClaimMessageInput,
    EventStatus,
    RegisteredEvent,
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
    }): Promise<RegisteredEvent>;

    abstract startEvent(eventId: string): Promise<void>;
    abstract finishEvent(eventId: string, status: EventStatus, lastError?: string): Promise<void>;

    // `phoneDigits` viene solo con dígitos; la comparación ignora el "+" y los espacios guardados
    abstract isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean>;

    abstract claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage>;
    abstract markMessageSent(messageStateId: string): Promise<void>;
    abstract markMessageFailed(messageStateId: string, lastError: string): Promise<void>;
}
