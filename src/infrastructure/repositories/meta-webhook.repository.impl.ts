import type {
    ClaimedMessage,
    ClaimMessageInput,
    EventStatus,
    MetaWebhookDatasource,
    MetaWebhookRepository,
    RegisteredEvent,
    WebhookConnection,
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
    }): Promise<RegisteredEvent> {
        return this.datasource.registerEvent(input);
    }

    startEvent(eventId: string): Promise<void> {
        return this.datasource.startEvent(eventId);
    }

    finishEvent(eventId: string, status: EventStatus, lastError?: string): Promise<void> {
        return this.datasource.finishEvent(eventId, status, lastError);
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
