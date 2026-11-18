import type { ContextRow, LeadRef, UsageInput } from "../entities/ai.entity";

export abstract class ConversationDatasource {
    // Lead mínimo del contacto (la FK del contexto lo exige). Devuelve su id, si ya recibió el
    // mensaje de bienvenida y actualiza la actividad.
    abstract upsertLead(
        tenantId: string,
        connectionId: string,
        whatsappNumber: string,
        isTest: boolean,
    ): Promise<LeadRef>;

    // Deja constancia de que el contacto ya recibió el mensaje de bienvenida
    abstract markWelcomeSent(connectionId: string, whatsappNumber: string): Promise<void>;

    // Los últimos `limit` mensajes del contacto, del más antiguo al más reciente
    abstract recentContext(leadId: string, limit: number): Promise<ContextRow[]>;

    // Añade mensajes, renueva el vencimiento de todo el contexto del contacto y deja solo los últimos `keep`
    abstract appendContext(
        tenantId: string,
        leadId: string,
        rows: ContextRow[],
        expiresAt: Date,
        keep: number,
    ): Promise<void>;

    // Borra el contexto vencido y devuelve cuántos mensajes eliminó
    abstract deleteExpired(now: Date): Promise<number>;

    abstract recordUsage(input: UsageInput): Promise<void>;
}
