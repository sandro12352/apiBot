import type { ContextRow, UsageInput } from "../entities/ai.entity";

export abstract class ConversationDatasource {
    // Lead mínimo del contacto (la FK del contexto lo exige). Devuelve su id y actualiza la actividad.
    abstract upsertLead(
        tenantId: string,
        connectionId: string,
        whatsappNumber: string,
        isTest: boolean,
    ): Promise<string>;

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
