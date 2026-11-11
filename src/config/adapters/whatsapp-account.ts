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

    // 190 (token caducado o inválido) y 0 (no se pudo autenticar) según la documentación de Meta
    get isInvalidToken(): boolean {
        return this.metaCode === 190 || this.metaCode === 0 || this.httpStatus === 401;
    }

    // La cuenta o el número no pueden enviar: 368 (restringida o desactivada por política),
    // 133010 (número no registrado) y 33 (número borrado)
    get isAccountNotEligible(): boolean {
        return this.metaCode === 368 || this.metaCode === 133010 || this.metaCode === 33;
    }

    // El token no tiene permisos: 3, 10, 131005 y el rango 200-299
    get isPermissionError(): boolean {
        const code = this.metaCode;
        return code === 3 || code === 10 || code === 131005 || (code !== undefined && code >= 200 && code <= 299);
    }

    // Problema de ESE destinatario, no de la conexión: 131030 (fuera de la lista permitida de un
    // número de prueba), 130403 (la empresa lo bloqueó), 130497 (país restringido), 131021 (mismo número)
    get isRecipientError(): boolean {
        const code = this.metaCode;
        return code === 131030 || code === 130403 || code === 130497 || code === 131021;
    }

    // Fallos que se pueden resolver solos: red, 5xx, límite de tasa y errores temporales de Meta
    get isTemporary(): boolean {
        const code = this.metaCode;
        return this.isUnavailable || code === 2 || code === 131000 || code === 131016 || code === 133004 || code === 130429;
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
