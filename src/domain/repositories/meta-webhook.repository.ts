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

export abstract class MetaWebhookRepository {
    abstract findConnectionByPhoneNumberId(phoneNumberId: string): Promise<WebhookConnection | null>;
    abstract registerEvent(input: {
        externalId: string;
        type: string;
        tenantId?: string;
        connectionId?: string;
        encryptedPayload?: string;
    }): Promise<RegisteredEvent>;
    abstract startEvent(eventId: string): Promise<number>;
    abstract finishEvent(eventId: string, status: EventStatus, lastError?: string, retryAt?: Date): Promise<void>;
    abstract findRetryable(now: Date, maxAttempts: number, limit: number): Promise<RetryableEvent[]>;
    abstract expireExhausted(now: Date, maxAttempts: number): Promise<void>;
    abstract markConnectionStatus(
        connectionId: string,
        status: WhatsappConnectionState,
        detail: string,
    ): Promise<boolean>;
    abstract applyAccountEvent(
        wabaId: string,
        change: { status?: WhatsappConnectionState; detail: string },
    ): Promise<AffectedConnection[]>;
    abstract isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean>;
    abstract claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage>;
    abstract markMessageSent(messageStateId: string): Promise<void>;
    abstract markMessageFailed(messageStateId: string, lastError: string): Promise<void>;
}
