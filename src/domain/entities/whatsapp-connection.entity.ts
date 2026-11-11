export type WhatsappConnectionState =
    | "PENDING"
    | "CONNECTED"
    | "DISCONNECTED"
    | "ERROR"
    | "TOKEN_EXPIRED"
    | "NOT_ELIGIBLE";

// Conexión tal como la ve el administrador de la empresa. Nunca incluye el token.
export interface WhatsappConnectionInfo {
    id: string;
    status: WhatsappConnectionState;
    statusDetail: string | null;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string | null;
    botEnabled: boolean;
    hasToken: boolean;
    lastConnectionTestAt: Date | null;
    lastConnectionTestOk: boolean | null;
    connectedAt: Date | null;
    disconnectedAt: Date | null;
}

export interface SaveConnectionInput {
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string | null;
    encryptedAccessToken: string;
}

// Uso interno del servicio: incluye el token cifrado, no se expone por HTTP
export interface ConnectionCredentials {
    id: string;
    status: WhatsappConnectionState;
    phoneNumberId: string;
    encryptedAccessToken: string | null;
}

export interface ConnectionCheckResult {
    ok: boolean;
    // undefined = no cambia el estado (por ejemplo, Meta no disponible)
    status?: WhatsappConnectionState;
    detail: string | null;
    displayPhoneNumber?: string;
}
