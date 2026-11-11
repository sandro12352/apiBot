export interface SendTextParams {
    phoneNumberId: string;
    // Número del destinatario solo con dígitos, tal como lo entrega Meta en `from`
    to: string;
    body: string;
    accessToken: string;
}

// Puerto de salida hacia WhatsApp: la lógica del bot no conoce la Graph API
export abstract class WhatsAppSender {
    abstract sendText(params: SendTextParams): Promise<{ messageId?: string }>;
}
