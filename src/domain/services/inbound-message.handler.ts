export interface InboundMessage {
    tenantId: string;
    connectionId: string;
    from: string;
    text: string;
    // La empresa está en modo prueba: los leads y el consumo se marcan como de prueba
    isTest: boolean;
}

// El handler decidió no responder por un motivo que conviene dejar visible en el evento
// (por ejemplo, un error del proveedor de IA). No es un fallo reintentable.
export class ReplySkipped extends Error {
    constructor(public readonly reason: string) {
        super(reason);
        this.name = "ReplySkipped";
    }
}

// Decide qué responder a un mensaje de texto. null = no responder.
export abstract class InboundMessageHandler {
    abstract handle(message: InboundMessage): Promise<string | null>;

    // Se llama después de enviar la respuesta con éxito (por ejemplo, para guardar el contexto
    // de la conversación). Por defecto no hace nada. Un fallo aquí no revierte el envío.
    async afterSent(_message: InboundMessage, _reply: string): Promise<void> {}
}

// Respuesta provisional para probar de extremo a extremo la entrada y salida
export class EchoMessageHandler extends InboundMessageHandler {
    async handle(message: InboundMessage): Promise<string | null> {
        return `Recibido: ${message.text}`;
    }
}
