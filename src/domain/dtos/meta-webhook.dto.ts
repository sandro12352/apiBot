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

const payloadSchema = z.looseObject({
    object: z.literal("whatsapp_business_account"),
    entry: z.array(
        z.looseObject({
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
                // Otros campos (account_update, history, ...) llegarán en fases posteriores
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
