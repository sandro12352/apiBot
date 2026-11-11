import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createWhatsappConnection, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID } from "./helpers/seed";
import { WhatsAppCloudClient } from "../src/infrastructure/whatsapp-meta/whatsapp-cloud.client";

// Webhook de Meta: firma, idempotencia y reglas de respuesta. El envío a Meta se simula.

const APP_SECRET = "test-app-secret";
const CUSTOMER = "51919608996";

let sendText: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    await resetDb();
    sendText = vi.spyOn(WhatsAppCloudClient.prototype, "sendText").mockResolvedValue({ messageId: "wamid.OUT" });
});
afterEach(() => vi.restoreAllMocks());

const sign = (body: string, secret = APP_SECRET) =>
    `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

const textPayload = (messageId = "wamid.IN1", text = "hola", from = CUSTOMER, phoneNumberId = WA_PHONE_NUMBER_ID) =>
    JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
            id: "waba-test",
            changes: [{
                field: "messages",
                value: {
                    messaging_product: "whatsapp",
                    metadata: { display_phone_number: "15550000000", phone_number_id: phoneNumberId },
                    contacts: [{ profile: { name: "Cliente" }, wa_id: from }],
                    messages: [{ from, id: messageId, timestamp: "1700000000", type: "text", text: { body: text } }],
                },
            }],
        }],
    });

const statusPayload = () =>
    JSON.stringify({
        object: "whatsapp_business_account",
        entry: [{
            id: "waba-test",
            changes: [{
                field: "messages",
                value: {
                    messaging_product: "whatsapp",
                    metadata: { phone_number_id: WA_PHONE_NUMBER_ID },
                    statuses: [{ id: "wamid.OUT", status: "delivered", recipient_id: CUSTOMER }],
                },
            }],
        }],
    });

// signature = null: sin cabecera de firma (undefined activaría el valor por defecto)
const post = (body: string, signature: string | null = sign(body)) => {
    const req = api().post("/webhooks/meta").set("Content-Type", "application/json");
    if (signature !== null) req.set("X-Hub-Signature-256", signature);
    return req.send(body);
};

// El procesamiento ocurre después del 200: se espera a que el evento llegue a un estado final
const waitForFinal = async (externalId: string) =>
    vi.waitFor(async () => {
        const event = await prisma.webhookEvent.findFirst({ where: { externalId } });
        expect(event).not.toBeNull();
        expect(["PROCESSED", "IGNORED", "FAILED"]).toContain(event!.status);
        return event!;
    });

describe("GET /webhooks/meta (verificación)", () => {
    it("devuelve el challenge con el verify token correcto", async () => {
        const res = await api()
            .get("/webhooks/meta")
            .query({ "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "1158201444" });

        expect(res.status).toBe(200);
        expect(res.text).toBe("1158201444");
        expect(res.headers["content-type"]).toContain("text/plain");
    });

    it("responde 403 con un token incorrecto o sin parámetros", async () => {
        const bad = await api()
            .get("/webhooks/meta")
            .query({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "123" });
        const empty = await api().get("/webhooks/meta");

        expect(bad.status).toBe(403);
        expect(empty.status).toBe(403);
    });
});

describe("POST /webhooks/meta (firma)", () => {
    it("rechaza una firma inválida, ajena o ausente y no guarda nada", async () => {
        await createWhatsappConnection();
        const body = textPayload();

        expect((await post(body, sign(body, "otro-secreto"))).status).toBe(401);
        expect((await post(body, "sha256=deadbeef")).status).toBe(401);
        expect((await post(body, "")).status).toBe(401);
        expect((await post(body, null)).status).toBe(401);

        expect(await prisma.webhookEvent.count()).toBe(0);
        expect(sendText).not.toHaveBeenCalled();
    });

    it("rechaza si el body fue alterado después de firmar", async () => {
        await createWhatsappConnection();
        const signature = sign(textPayload("wamid.IN1", "hola"));

        const res = await post(textPayload("wamid.IN1", "hola alterado"), signature);

        expect(res.status).toBe(401);
        expect(sendText).not.toHaveBeenCalled();
    });

    it("responde 400 ante un payload firmado pero con otra forma", async () => {
        const body = JSON.stringify({ object: "page", entry: [] });
        expect((await post(body)).status).toBe(400);
    });
});

describe("POST /webhooks/meta (procesamiento)", () => {
    it("guarda el evento, responde por WhatsApp con el token descifrado y marca el envío", async () => {
        const { connection, tenant } = await createWhatsappConnection();

        const res = await post(textPayload("wamid.IN1", "hola"));
        expect(res.status).toBe(200);

        const event = await waitForFinal("wamid.IN1");
        expect(event).toMatchObject({ status: "PROCESSED", type: "message", tenantId: tenant.id, connectionId: connection.id });

        expect(sendText).toHaveBeenCalledTimes(1);
        expect(sendText).toHaveBeenCalledWith({
            phoneNumberId: WA_PHONE_NUMBER_ID,
            to: CUSTOMER,
            body: "Recibido: hola",
            accessToken: WA_ACCESS_TOKEN,
        });

        const state = await prisma.messageProcessingState.findFirstOrThrow({ where: { externalMessageId: "wamid.IN1" } });
        expect(state.status).toBe("PROCESSED");
        expect(state.responseSentAt).not.toBeNull();
    });

    it("el token se guarda cifrado en la base de datos", async () => {
        const { connection } = await createWhatsappConnection();
        const stored = await prisma.whatsappConnection.findUniqueOrThrow({ where: { id: connection.id } });

        expect(stored.encryptedAccessToken).not.toBeNull();
        expect(stored.encryptedAccessToken).not.toContain(WA_ACCESS_TOKEN);
    });

    it("un mismo evento entregado dos veces se responde una sola vez", async () => {
        await createWhatsappConnection();
        const body = textPayload("wamid.DUP");

        expect((await post(body)).status).toBe(200);
        await waitForFinal("wamid.DUP");
        expect((await post(body)).status).toBe(200);
        // Margen para que un procesamiento duplicado (si existiera) llegara a ejecutarse
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(sendText).toHaveBeenCalledTimes(1);
        expect(await prisma.webhookEvent.count({ where: { externalId: "wamid.DUP" } })).toBe(1);
        expect(await prisma.messageProcessingState.count({ where: { externalMessageId: "wamid.DUP" } })).toBe(1);
    });

    it("una conexión desconocida se registra como ignorada y no responde", async () => {
        await createWhatsappConnection();

        const res = await post(textPayload("wamid.UNK", "hola", CUSTOMER, "999999999999999"));
        expect(res.status).toBe(200);

        const event = await waitForFinal("wamid.UNK");
        expect(event.status).toBe("IGNORED");
        expect(event.tenantId).toBeNull();
        expect(sendText).not.toHaveBeenCalled();
    });

    it("los estados de entrega se registran y no generan respuesta", async () => {
        await createWhatsappConnection();

        expect((await post(statusPayload())).status).toBe(200);

        const event = await waitForFinal("wamid.OUT:delivered");
        expect(event).toMatchObject({ status: "IGNORED", type: "status" });
        expect(sendText).not.toHaveBeenCalled();
    });

    it.each([
        ["el bot de la empresa está apagado", { tenantBotEnabled: false }],
        ["el bot de la conexión está apagado", { connectionBotEnabled: false }],
        ["la conexión no está CONNECTED", { status: "DISCONNECTED" as const }],
    ])("no responde si %s", async (_name, options) => {
        await createWhatsappConnection(options);

        expect((await post(textPayload("wamid.OFF"))).status).toBe(200);

        expect((await waitForFinal("wamid.OFF")).status).toBe("IGNORED");
        expect(sendText).not.toHaveBeenCalled();
    });

    it("no responde a mensajes que no son de texto", async () => {
        await createWhatsappConnection();
        const body = textPayload("wamid.IMG").replace('"type":"text"', '"type":"image"');

        expect((await post(body)).status).toBe(200);

        expect((await waitForFinal("wamid.IMG")).status).toBe("IGNORED");
        expect(sendText).not.toHaveBeenCalled();
    });
});

describe("modo prueba", () => {
    it("en modo TEST solo responde a los números autorizados (ignora '+' y espacios)", async () => {
        const { tenant, connection } = await createWhatsappConnection({ botMode: "TEST" });
        await prisma.testNumber.create({
            data: { tenantId: tenant.id, connectionId: connection.id, phoneNumber: "+51 919 608 996" },
        });

        await post(textPayload("wamid.T1", "hola", CUSTOMER));
        await post(textPayload("wamid.T2", "hola", "51900000000"));

        expect((await waitForFinal("wamid.T1")).status).toBe("PROCESSED");
        expect((await waitForFinal("wamid.T2")).status).toBe("IGNORED");
        expect(sendText).toHaveBeenCalledTimes(1);
        expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ to: CUSTOMER }));
    });
});

describe("fallos de envío", () => {
    it("marca el evento FAILED sin filtrar el token y lo reintenta cuando Meta reenvía", async () => {
        await createWhatsappConnection();
        sendText.mockRejectedValueOnce(new Error("WhatsApp send failed (HTTP 401, code 190)"));
        const body = textPayload("wamid.FAIL");

        expect((await post(body)).status).toBe(200);
        const failed = await waitForFinal("wamid.FAIL");
        expect(failed.status).toBe("FAILED");
        expect(failed.lastError).toContain("HTTP 401");
        expect(failed.lastError).not.toContain(WA_ACCESS_TOKEN);
        expect(failed.attempts).toBe(1);

        // Meta reintenta la entrega: ahora el envío funciona
        expect((await post(body)).status).toBe(200);
        await vi.waitFor(async () => {
            const event = await prisma.webhookEvent.findFirstOrThrow({ where: { externalId: "wamid.FAIL" } });
            expect(event.status).toBe("PROCESSED");
            expect(event.attempts).toBe(2);
        });

        expect(sendText).toHaveBeenCalledTimes(2);
        const state = await prisma.messageProcessingState.findFirstOrThrow({ where: { externalMessageId: "wamid.FAIL" } });
        expect(state.responseSentAt).not.toBeNull();
    });

    it("tras el tope de reintentos deja de reprocesar el evento", async () => {
        await createWhatsappConnection();
        sendText.mockRejectedValue(new Error("WhatsApp send failed (HTTP 500)"));
        const body = textPayload("wamid.LOOP");

        for (let attempt = 1; attempt <= 3; attempt++) {
            expect((await post(body)).status).toBe(200);
            await vi.waitFor(async () => {
                const event = await prisma.webhookEvent.findFirstOrThrow({ where: { externalId: "wamid.LOOP" } });
                expect(event.status).toBe("FAILED");
                expect(event.attempts).toBe(attempt);
            });
        }

        expect((await post(body)).status).toBe(200);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(sendText).toHaveBeenCalledTimes(3);
    });
});
