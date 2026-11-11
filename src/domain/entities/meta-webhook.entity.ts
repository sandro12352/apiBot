export type EventStatus = "RECEIVED" | "QUEUED" | "PROCESSING" | "PROCESSED" | "FAILED" | "IGNORED";
export type TenantBotMode = "TEST" | "LIVE";

// Evento ya normalizado a partir del payload de Meta
export type InboundEvent =
    | {
          kind: "message";
          phoneNumberId: string;
          externalId: string;
          from: string;
          messageType: string;
          text?: string;
      }
    | {
          kind: "status";
          phoneNumberId: string;
          // Un mismo mensaje recibe varios estados (sent, delivered, read): el id los distingue
          externalId: string;
          status: string;
      };

export interface WebhookConnection {
    id: string;
    tenantId: string;
    status: string;
    botEnabled: boolean;
    phoneNumberId: string;
    encryptedAccessToken: string | null;
    tenant: {
        status: string;
        botEnabled: boolean;
        botMode: TenantBotMode;
    };
}

export interface RegisteredEvent {
    id: string;
    isNew: boolean;
    status: EventStatus;
    attempts: number;
}

export interface ClaimMessageInput {
    tenantId: string;
    connectionId: string;
    externalMessageId: string;
    idempotencyKey: string;
}

export interface ClaimedMessage {
    // false = ya se respondió (o se está respondiendo): no enviar de nuevo
    claimed: boolean;
    id?: string;
}

// Trabajo pendiente tras guardar el evento; se procesa después de responder 200 a Meta
export interface PendingJob {
    eventId: string;
    connection: WebhookConnection;
    event: InboundEvent;
}
