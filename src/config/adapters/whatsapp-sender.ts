export interface SendTextParams {
    phoneNumberId: string;
    // Número del destinatario solo con dígitos, tal como lo entrega Meta en `from`
    to: string;
    body: string;
    accessToken: string;
}

export interface SendImageParams {
    phoneNumberId: string;
    to: string;
    // URL HTTPS desde la que Meta descarga la imagen (enlace firmado de corta duración)
    link: string;
    caption?: string;
    accessToken: string;
}

// Puerto de salida hacia WhatsApp: la lógica del bot no conoce la Graph API
export abstract class WhatsAppSender {
    abstract sendText(params: SendTextParams): Promise<{ messageId?: string }>;
    abstract sendImage(params: SendImageParams): Promise<{ messageId?: string }>;
}
