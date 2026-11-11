import { z } from "zod";
import type { InboundEvent } from "../entities/meta-webhook.entity";

// Esquemas tolerantes: Meta añade campos con frecuencia y no debemos rechazar por ello.
const messageSchema = z.looseObject({
    id: z.string().min(1),
    from: z.string().min(1),
    type: z.string().min(1),
    text: z.looseObject({ body: z.string() }).optional(),
});

const statusSchema = z.looseObject({
    id: z.string().min(1),
    status: z.string().min(1),
});

const messagesValueSchema = z.looseObject({
    metadata: z.looseObject({ phone_number_id: z.string().min(1) }),
    messages: z.array(messageSchema).optional(),
    statuses: z.array(statusSchema).optional(),
});

const accountValueSchema = z.looseObject({
    event: z.string().min(1),
    waba_info: z.looseObject({ waba_id: z.string().min(1) }).optional(),
    disconnection_info: z.looseObject({ reason: z.string().optional() }).optional(),
});

const payloadSchema = z.looseObject({
    object: z.literal("whatsapp_business_account"),
    entry: z.array(
        z.looseObject({
            id: z.string().optional(),
            time: z.union([z.number(), z.string()]).optional(),
            changes: z.array(z.looseObject({ field: z.string(), value: z.unknown() })),
        }),
    ),
});

export class MetaWebhookDto {
    private constructor(public readonly events: InboundEvent[]) {}

    static create(body: unknown): [string[] | undefined, MetaWebhookDto | undefined] {
        const result = payloadSchema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const events: InboundEvent[] = [];

        for (const entry of result.data.entry) {
            for (const change of entry.changes) {
                if (change.field === "account_update") {
                    const account = accountValueSchema.safeParse(change.value);
                    if (!account.success) continue;
                    // En eventos de partner entry.id es el negocio del partner: el WABA va en waba_info
                    const wabaId = account.data.waba_info?.waba_id ?? entry.id;
                    if (!wabaId) continue;
                    events.push({
                        kind: "account",
                        wabaId,
                        // El payload no trae id de evento: cuenta + evento + hora identifican la entrega
                        externalId: `${wabaId}:${account.data.event}:${entry.time ?? "0"}`,
                        event: account.data.event,
                        ...(account.data.disconnection_info?.reason
                            ? { reason: account.data.disconnection_info.reason }
                            : {}),
                    });
                    continue;
                }

                // Otros campos (history, smb_message_echoes, ...) llegarán con medios y coexistencia
                if (change.field !== "messages") continue;

                const value = messagesValueSchema.safeParse(change.value);
                if (!value.success) continue;

                const phoneNumberId = value.data.metadata.phone_number_id;

                for (const message of value.data.messages ?? []) {
                    events.push({
                        kind: "message",
                        phoneNumberId,
                        externalId: message.id,
                        from: message.from,
                        messageType: message.type,
                        ...(message.text ? { text: message.text.body } : {}),
                    });
                }

                for (const status of value.data.statuses ?? []) {
                    events.push({
                        kind: "status",
                        phoneNumberId,
                        externalId: `${status.id}:${status.status}`,
                        status: status.status,
                    });
                }
            }
        }

        return [undefined, new MetaWebhookDto(events)];
    }
}
