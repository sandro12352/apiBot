export interface PhoneNumberInfo {
    displayPhoneNumber?: string;
    verifiedName?: string;
}

// Error normalizado de la Graph API: nunca incluye el token ni el cuerpo de la respuesta.
// httpStatus 0 = fallo de red o timeout.
export class WhatsAppApiError extends Error {
    constructor(
        public readonly httpStatus: number,
        public readonly metaCode?: number,
    ) {
        super(`WhatsApp API error (HTTP ${httpStatus}${metaCode !== undefined ? `, code ${metaCode}` : ""})`);
        this.name = "WhatsAppApiError";
    }

    // Código 190 de Meta = token inválido, caducado o revocado
    get isInvalidToken(): boolean {
        return this.metaCode === 190 || this.httpStatus === 401;
    }

    // Código 100 = el número no existe o el token no tiene acceso a él
    get isNotAccessible(): boolean {
        return this.metaCode === 100 || this.httpStatus === 404;
    }

    get isUnavailable(): boolean {
        return this.httpStatus === 0 || this.httpStatus >= 500 || this.httpStatus === 429;
    }
}

// Puerto de consulta de la cuenta: sirve para validar credenciales y probar la conexión
export abstract class WhatsAppAccount {
    abstract getPhoneNumber(params: { phoneNumberId: string; accessToken: string }): Promise<PhoneNumberInfo>;
}
