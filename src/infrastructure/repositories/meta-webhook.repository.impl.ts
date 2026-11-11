import type {
    AffectedConnection,
    ClaimedMessage,
    ClaimMessageInput,
    EventStatus,
    MetaWebhookDatasource,
    MetaWebhookRepository,
    RegisteredEvent,
    RetryableEvent,
    WebhookConnection,
    WhatsappConnectionState,
} from "../../domain";


export class MetaWebhookRepositoryImpl implements MetaWebhookRepository {
    constructor(private readonly datasource: MetaWebhookDatasource) {}

    findConnectionByPhoneNumberId(phoneNumberId: string): Promise<WebhookConnection | null> {
        return this.datasource.findConnectionByPhoneNumberId(phoneNumberId);
    }

    registerEvent(input: {
        externalId: string;
        type: string;
        tenantId?: string;
        connectionId?: string;
        encryptedPayload?: string;
    }): Promise<RegisteredEvent> {
        return this.datasource.registerEvent(input);
    }

    startEvent(eventId: string): Promise<number> {
        return this.datasource.startEvent(eventId);
    }

    finishEvent(eventId: string, status: EventStatus, lastError?: string, retryAt?: Date): Promise<void> {
        return this.datasource.finishEvent(eventId, status, lastError, retryAt);
    }

    findRetryable(now: Date, maxAttempts: number, limit: number): Promise<RetryableEvent[]> {
        return this.datasource.findRetryable(now, maxAttempts, limit);
    }

    expireExhausted(now: Date, maxAttempts: number): Promise<void> {
        return this.datasource.expireExhausted(now, maxAttempts);
    }

    markConnectionStatus(connectionId: string, status: WhatsappConnectionState, detail: string): Promise<boolean> {
        return this.datasource.markConnectionStatus(connectionId, status, detail);
    }

    applyAccountEvent(
        wabaId: string,
        change: { status?: WhatsappConnectionState; detail: string },
    ): Promise<AffectedConnection[]> {
        return this.datasource.applyAccountEvent(wabaId, change);
    }

    isTestNumber(tenantId: string, phoneDigits: string): Promise<boolean> {
        return this.datasource.isTestNumber(tenantId, phoneDigits);
    }

    claimMessage(input: ClaimMessageInput): Promise<ClaimedMessage> {
        return this.datasource.claimMessage(input);
    }

    markMessageSent(messageStateId: string): Promise<void> {
        return this.datasource.markMessageSent(messageStateId);
    }

    markMessageFailed(messageStateId: string, lastError: string): Promise<void> {
        return this.datasource.markMessageFailed(messageStateId, lastError);
    }
}
