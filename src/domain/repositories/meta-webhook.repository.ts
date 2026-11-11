import type {
    ClaimedMessage,
    ClaimMessageInput,
    EventStatus,
    RegisteredEvent,
    WebhookConnection,
} from "../entities/meta-webhook.entity";

export abstract class MetaWebhookRepository {
    abstract findConnectionByPhoneNumberId(phoneNumberId: string): Promise<WebhookConnection | null>;
    abstract registerEvent(input: {
        externalId: string;
        type: string;
        tenantId?: string;
        connectionId?: string;
    }): Promise<RegisteredEvent>;
    abstract startEvent(eventId: string): Promise<void>;
    abstract finishEvent(eventId: string, status: EventStatus, lastError?: string): Promise<void>;
    abstract isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean>;
    abstract claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage>;
    abstract markMessageSent(messageStateId: string): Promise<void>;
    abstract markMessageFailed(messageStateId: string, lastError: string): Promise<void>;
}
