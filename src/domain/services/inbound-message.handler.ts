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

// Imagen a enviar tras el texto: archivo privado + leyenda (ej. nombre y precio del producto)
export interface OutgoingImage {
    storageKey: string;
    caption: string;
}

// Respuesta con imágenes. Una respuesta solo de texto puede devolverse como string.
export interface BotReply {
    text: string;
    images: OutgoingImage[];
}

// Decide qué responder a un mensaje de texto. null = no responder.
export abstract class InboundMessageHandler {
    abstract handle(message: InboundMessage): Promise<string | BotReply | null>;

    // Mensaje de bienvenida que debe enviarse ANTES de la respuesta (null = ninguno). Se consulta
    // solo cuando ya hay respuesta que enviar. Por defecto no hay bienvenida.
    async welcome(_message: InboundMessage): Promise<string | null> {
        return null;
    }

    // Se llama tras enviar la bienvenida, para no repetirla con ese contacto
    async welcomeSent(_message: InboundMessage, _welcome: string): Promise<void> {}

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
