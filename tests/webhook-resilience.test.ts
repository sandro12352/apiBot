import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createWhatsappConnection, WA_PHONE_NUMBER_ID } from "./helpers/seed";
import { AesGcmAdapter } from "../src/config/adapters/aes-gcm.adapter";
import { WhatsAppApiError } from "../src/config/adapters/whatsapp-account";
import { AiConversationHandler } from "../src/domain";
import { WhatsAppCloudClient } from "../src/infrastructure/whatsapp-meta/whatsapp-cloud.client";
import { buildMetaWebhookService } from "../src/presentation/auth/auth.factory";

// Errores de envío, desconexión automática, eventos de la cuenta y reproceso de eventos.

const CUSTOMER = "51919608996";
const WABA_ID = "waba-test";
const MINUTE = 60_000;

let sendText: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    await resetDb();
    sendText = vi.spyOn(WhatsAppCloudClient.prototype, "sendText").mockResolvedValue({ messageId: "wamid.OUT" });
    // Estas pruebas son del webhook, no de la IA: el handler responde con un eco
    vi.spyOn(AiConversationHandler.prototype, "handle").mockImplementation(async (message) => `Recibido: ${message.text}`);
    vi.spyOn(AiConversationHandler.prototype, "afterSent").mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());

const sign = (body: string) => `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
const post = (body: string) =>
    api().post("/webhooks/meta").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(body)).send(body);

const textPayload = (messageId: string, text = "hola secreto") =>
    JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
            id: WABA_ID,
            changes: [{
                field: "messages",
                value: {
                    messaging_product: "whatsapp",
                    metadata: { phone_number_id: WA_PHONE_NUMBER_ID },
                    messages: [{ from: CUSTOMER, id: messageId, timestamp: "1700000000", type: "text", text: { body: text } }],
                },
            }],
        }],
    });

const accountPayload = (event: string, extra: Record<string, unknown> = {}, entryId = WABA_ID, time = 1700000000) =>
    JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{ id: entryId, time, changes: [{ field: "account_update", value: { event, ...extra } }] }],
    });

const eventOf = (externalId: string) => prisma.webhookEvent.findFirstOrThrow({ where: { externalId } });

const waitForStatus = (externalId: string, status: string) =>
    vi.waitFor(async () => {
        const event = await prisma.webhookEvent.findFirst({ where: { externalId } });
        expect(event?.status).toBe(status);
        return event!;
    });

const connectionOf = (tenantId: string) => prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId } });

// Inserta a mano un evento sin terminar, como si el servidor hubiera caído a mitad
const insertUnfinished = async (
    tenantId: string,
    connectionId: string,
    overrides: { status?: "RECEIVED" | "PROCESSING"; attempts?: number; payload?: string } = {},
) =>
    prisma.webhookEvent.create({
        data: {
            externalId: "wamid.CRASH",
            type: "message",
            tenantId,
            connectionId,
            status: overrides.status ?? "RECEIVED",
            attempts: overrides.attempts ?? 0,
            nextAttemptAt: new Date(Date.now() - MINUTE),
            encryptedPayload:
                overrides.payload ??
                new AesGcmAdapter().encrypt(JSON.stringify({
                    kind: "message",
                    phoneNumberId: WA_PHONE_NUMBER_ID,
                    externalId: "wamid.CRASH",
                    from: CUSTOMER,
                    messageType: "text",
                    text: "hola",
                })),
        },
    });

describe("rechazos de Meta al enviar", () => {
    it.each([
        ["token inválido (190)", new WhatsAppApiError(401, 190), "TOKEN_EXPIRED"],
        ["cuenta no registrada (133010)", new WhatsAppApiError(400, 133010), "NOT_ELIGIBLE"],
        ["cuenta restringida (368)", new WhatsAppApiError(400, 368), "NOT_ELIGIBLE"],
        ["permisos retirados (200)", new WhatsAppApiError(403, 200), "ERROR"],
    ])("%s: marca la conexión %s, no reintenta y audita", async (_name, error, expected) => {
        const { tenant, connection } = await createWhatsappConnection();
        sendText.mockRejectedValueOnce(error);

        expect((await post(textPayload("wamid.E1"))).status).toBe(200);

        const event = await waitForStatus("wamid.E1", "FAILED");
        expect(event.nextAttemptAt).toBeNull();
        expect(event.encryptedPayload).toBeNull();

        const stored = await connectionOf(tenant.id);
        expect(stored.status).toBe(expected);
        expect(stored.statusDetail).toBeTruthy();
        expect(stored.id).toBe(connection.id);

        const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "whatsapp.connection.status" } });
        expect(audit).toMatchObject({ tenantId: tenant.id, resourceId: connection.id });

        // Con la conexión ya marcada, los mensajes siguientes se ignoran sin llamar a Meta
        sendText.mockClear();
        await post(textPayload("wamid.E2"));
        await waitForStatus("wamid.E2", "IGNORED");
        expect(sendText).not.toHaveBeenCalled();
    });

    it("un problema del destinatario (131030) no toca la conexión ni se reintenta", async () => {
        const { tenant } = await createWhatsappConnection();
        sendText.mockRejectedValueOnce(new WhatsAppApiError(400, 131030));

        await post(textPayload("wamid.R1"));

        const event = await waitForStatus("wamid.R1", "FAILED");
        expect(event.nextAttemptAt).toBeNull();
        expect((await connectionOf(tenant.id)).status).toBe("CONNECTED");
        expect(await prisma.auditLog.count({ where: { action: "whatsapp.connection.status" } })).toBe(0);
    });

    it("un rechazo 4xx desconocido no se reintenta y no cambia la conexión", async () => {
        const { tenant } = await createWhatsappConnection();
        sendText.mockRejectedValueOnce(new WhatsAppApiError(400, 131009));

        await post(textPayload("wamid.R2"));

        const event = await waitForStatus("wamid.R2", "FAILED");
        expect(event.nextAttemptAt).toBeNull();
        expect((await connectionOf(tenant.id)).status).toBe("CONNECTED");
    });

    it("sin token guardado marca ERROR en vez de reintentar", async () => {
        const { tenant } = await createWhatsappConnection();
        await prisma.whatsappConnection.updateMany({ where: { tenantId: tenant.id }, data: { encryptedAccessToken: null } });

        await post(textPayload("wamid.NT"));

        const event = await waitForStatus("wamid.NT", "FAILED");
        expect(event.nextAttemptAt).toBeNull();
        expect((await connectionOf(tenant.id)).status).toBe("ERROR");
    });
});

describe("reintentos de fallos temporales", () => {
    it("un fallo temporal programa el reintento y guarda el mensaje cifrado", async () => {
        const { tenant } = await createWhatsappConnection();
        sendText.mockRejectedValueOnce(new WhatsAppApiError(503));
        const before = Date.now();

        await post(textPayload("wamid.T1", "hola secreto"));

        const event = await waitForStatus("wamid.T1", "FAILED");
        expect(event.attempts).toBe(1);
        expect(event.nextAttemptAt!.getTime()).toBeGreaterThan(before + 50_000);
        expect(event.nextAttemptAt!.getTime()).toBeLessThan(before + 70_000);
        // El contenido no se guarda en claro
        expect(event.encryptedPayload).not.toBeNull();
        expect(event.encryptedPayload).not.toContain("secreto");
        expect((await connectionOf(tenant.id)).status).toBe("CONNECTED");
    });

    it("el reprocesador responde cuando llega la hora y limpia el contenido guardado", async () => {
        await createWhatsappConnection();
        sendText.mockRejectedValueOnce(new WhatsAppApiError(503));
        await post(textPayload("wamid.T2"));
        await waitForStatus("wamid.T2", "FAILED");
        const service = buildMetaWebhookService();

        // Antes de la hora programada no hace nada
        expect(await service.reprocessPending(new Date())).toBe(0);
        expect(sendText).toHaveBeenCalledTimes(1);

        expect(await service.reprocessPending(new Date(Date.now() + 2 * MINUTE))).toBe(1);

        const event = await eventOf("wamid.T2");
        expect(event).toMatchObject({ status: "PROCESSED", attempts: 2, nextAttemptAt: null, encryptedPayload: null });
        expect(sendText).toHaveBeenCalledTimes(2);
        const state = await prisma.messageProcessingState.findFirstOrThrow({ where: { externalMessageId: "wamid.T2" } });
        expect(state.responseSentAt).not.toBeNull();

        // Ya terminado: no se vuelve a responder
        expect(await service.reprocessPending(new Date(Date.now() + 60 * MINUTE))).toBe(0);
        expect(sendText).toHaveBeenCalledTimes(2);
    });

    it("tras 3 intentos fallidos deja de reintentar y borra el contenido", async () => {
        await createWhatsappConnection();
        sendText.mockRejectedValue(new WhatsAppApiError(503));
        await post(textPayload("wamid.T3"));
        await waitForStatus("wamid.T3", "FAILED");
        const service = buildMetaWebhookService();

        await service.reprocessPending(new Date(Date.now() + 2 * MINUTE));
        await service.reprocessPending(new Date(Date.now() + 10 * MINUTE));

        const event = await eventOf("wamid.T3");
        expect(event).toMatchObject({ status: "FAILED", attempts: 3, nextAttemptAt: null, encryptedPayload: null });

        expect(await service.reprocessPending(new Date(Date.now() + 60 * MINUTE))).toBe(0);
        expect(sendText).toHaveBeenCalledTimes(3);
    });

    it("recupera un mensaje que quedó sin procesar por una caída del servidor", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await insertUnfinished(tenant.id, connection.id);

        expect(await buildMetaWebhookService().reprocessPending()).toBe(1);

        expect((await eventOf("wamid.CRASH")).status).toBe("PROCESSED");
        expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: CUSTOMER, body: "Recibido: hola" }));
    });

    it("no retoma un evento cuya reserva aún no venció", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        const event = await insertUnfinished(tenant.id, connection.id, { status: "PROCESSING", attempts: 1 });
        await prisma.webhookEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date(Date.now() + MINUTE) } });

        expect(await buildMetaWebhookService().reprocessPending()).toBe(0);
        expect(sendText).not.toHaveBeenCalled();
    });

    it("cierra como FAILED un evento sin terminar que agotó sus intentos", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await insertUnfinished(tenant.id, connection.id, { status: "PROCESSING", attempts: 3 });

        expect(await buildMetaWebhookService().reprocessPending()).toBe(0);

        const event = await eventOf("wamid.CRASH");
        expect(event).toMatchObject({ status: "FAILED", lastError: "Retries exhausted", encryptedPayload: null });
        expect(sendText).not.toHaveBeenCalled();
    });

    it("descarta sin responder si la conexión ya no está activa", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await insertUnfinished(tenant.id, connection.id);
        await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { status: "TOKEN_EXPIRED" } });

        await buildMetaWebhookService().reprocessPending();

        expect(await eventOf("wamid.CRASH")).toMatchObject({ status: "IGNORED", encryptedPayload: null });
        expect(sendText).not.toHaveBeenCalled();
    });

    it("marca FAILED un contenido guardado que no se puede leer", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await insertUnfinished(tenant.id, connection.id, { payload: "basura.basura.basura" });

        await buildMetaWebhookService().reprocessPending();

        expect(await eventOf("wamid.CRASH")).toMatchObject({ status: "FAILED", encryptedPayload: null });
        expect(sendText).not.toHaveBeenCalled();
    });

    it("un mensaje procesado a la primera no deja su contenido guardado", async () => {
        await createWhatsappConnection();

        await post(textPayload("wamid.OK"));

        const event = await waitForStatus("wamid.OK", "PROCESSED");
        expect(event.encryptedPayload).toBeNull();
        expect(event.nextAttemptAt).toBeNull();
    });
});

describe("eventos de la cuenta (account_update)", () => {
    const accountEvent = (externalId: string) => prisma.webhookEvent.findFirstOrThrow({ where: { externalId, type: "account" } });

    it("DISABLED_UPDATE marca la conexión NOT_ELIGIBLE y audita", async () => {
        const { tenant } = await createWhatsappConnection();

        expect((await post(accountPayload("DISABLED_UPDATE", { ban_info: { waba_ban_state: ["DISABLE"] } }))).status).toBe(200);

        await waitForStatus(`${WABA_ID}:DISABLED_UPDATE:1700000000`, "PROCESSED");
        const stored = await connectionOf(tenant.id);
        expect(stored.status).toBe("NOT_ELIGIBLE");
        expect(stored.statusDetail).toContain("DISABLED_UPDATE");
        expect(await prisma.auditLog.count({ where: { action: "whatsapp.connection.status", tenantId: tenant.id } })).toBe(1);
    });

    it("PARTNER_REMOVED desconecta usando el WABA de waba_info aunque entry.id sea del partner", async () => {
        const { tenant } = await createWhatsappConnection();
        const body = accountPayload(
            "PARTNER_REMOVED",
            { waba_info: { waba_id: WABA_ID }, disconnection_info: { reason: "PRIMARY_INACTIVITY", initiated_by: "SYSTEM" } },
            "partner-business-id",
        );

        await post(body);

        await waitForStatus(`${WABA_ID}:PARTNER_REMOVED:1700000000`, "PROCESSED");
        const stored = await connectionOf(tenant.id);
        expect(stored.status).toBe("DISCONNECTED");
        expect(stored.statusDetail).toContain("PRIMARY_INACTIVITY");
        expect(stored.disconnectedAt).not.toBeNull();
    });

    it("ACCOUNT_OFFBOARDED desconecta", async () => {
        const { tenant } = await createWhatsappConnection();

        await post(accountPayload("ACCOUNT_OFFBOARDED"));

        await waitForStatus(`${WABA_ID}:ACCOUNT_OFFBOARDED:1700000000`, "PROCESSED");
        expect((await connectionOf(tenant.id)).status).toBe("DISCONNECTED");
    });

    it("un aviso de violación solo deja constancia y no apaga el bot", async () => {
        const { tenant } = await createWhatsappConnection();

        await post(accountPayload("ACCOUNT_VIOLATION", { violation_info: { violation_type: "SPAM" } }));

        await waitForStatus(`${WABA_ID}:ACCOUNT_VIOLATION:1700000000`, "PROCESSED");
        const stored = await connectionOf(tenant.id);
        expect(stored.status).toBe("CONNECTED");
        expect(stored.statusDetail).toContain("ACCOUNT_VIOLATION");
    });

    it("el mismo evento entregado dos veces se aplica una sola vez", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        const body = accountPayload("DISABLED_UPDATE");

        await post(body);
        await waitForStatus(`${WABA_ID}:DISABLED_UPDATE:1700000000`, "PROCESSED");
        // La empresa arregla la conexión y Meta reenvía el mismo evento
        await prisma.whatsappConnection.update({ where: { id: connection.id }, data: { status: "CONNECTED", statusDetail: null } });
        await post(body);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect((await connectionOf(tenant.id)).status).toBe("CONNECTED");
        expect(await prisma.webhookEvent.count({ where: { type: "account" } })).toBe(1);
    });

    it("eventos desconocidos o de una cuenta no registrada se guardan como ignorados", async () => {
        const { tenant } = await createWhatsappConnection();

        await post(accountPayload("VOLUME_BASED_PRICING_TIER_UPDATE"));
        await post(accountPayload("DISABLED_UPDATE", {}, "otra-cuenta", 1700000001));

        await waitForStatus(`${WABA_ID}:VOLUME_BASED_PRICING_TIER_UPDATE:1700000000`, "IGNORED");
        await waitForStatus("otra-cuenta:DISABLED_UPDATE:1700000001", "IGNORED");
        expect((await connectionOf(tenant.id)).status).toBe("CONNECTED");
        expect((await accountEvent("otra-cuenta:DISABLED_UPDATE:1700000001")).tenantId).toBeNull();
    });
});
