export interface InboundMessage {
    tenantId: string;
    connectionId: string;
    from: string;
    text: string;
}

// Decide qué responder a un mensaje de texto. null = no responder.
// En la Fase 3 se sustituye por el flujo con IA, sin tocar el webhook.
export abstract class InboundMessageHandler {
    abstract handle(message: InboundMessage): Promise<string | null>;
}

// Respuesta provisional para probar de extremo a extremo la entrada y salida
export class EchoMessageHandler extends InboundMessageHandler {
    async handle(message: InboundMessage): Promise<string | null> {
        return `Recibido: ${message.text}`;
    }
}
