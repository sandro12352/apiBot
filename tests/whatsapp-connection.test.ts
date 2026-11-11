import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createTwoTenants } from "./helpers/seed";
import { WhatsAppApiError } from "../src/config/adapters/whatsapp-account";
import { AesGcmAdapter } from "../src/config/adapters/aes-gcm.adapter";
import { WhatsAppCloudClient } from "../src/infrastructure/whatsapp-meta/whatsapp-cloud.client";

// Conexión de WhatsApp por empresa: solo TENANT_ADMIN, token cifrado y nunca expuesto.

const TOKEN = "EAAB-token-de-prueba-0123456789";
const body = (overrides: Record<string, string> = {}) => ({
    phoneNumberId: "111222333444555",
    wabaId: "999888777666555",
    accessToken: TOKEN,
    ...overrides,
});

let getPhoneNumber: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    await resetDb();
    getPhoneNumber = vi
        .spyOn(WhatsAppCloudClient.prototype, "getPhoneNumber")
        .mockResolvedValue({ displayPhoneNumber: "+1 555 000 1111", verifiedName: "Empresa" });
});
afterEach(() => vi.restoreAllMocks());

const asAdminA = async () => {
    const data = await createTwoTenants();
    const { accessToken } = await login(data.adminA.email);
    return { ...data, auth: bearer(accessToken) };
};

describe("permisos", () => {
    it("un MEMBER recibe 403 y un administrador de otra empresa 404", async () => {
        const { tenantA, memberA, adminB } = await createTwoTenants();
        const member = await login(memberA.email);
        const foreign = await login(adminB.email);

        for (const request of [
            () => api().get(`/tenants/${tenantA.id}/whatsapp`),
            () => api().put(`/tenants/${tenantA.id}/whatsapp`).send(body()),
            () => api().post(`/tenants/${tenantA.id}/whatsapp/check`),
            () => api().delete(`/tenants/${tenantA.id}/whatsapp`),
        ]) {
            expect((await request().set(...bearer(member.accessToken))).status).toBe(403);
            expect((await request().set(...bearer(foreign.accessToken))).status).toBe(404);
            expect((await request()).status).toBe(401);
        }
        expect(getPhoneNumber).not.toHaveBeenCalled();
        expect(await prisma.whatsappConnection.count()).toBe(0);
    });
});

describe("conectar", () => {
    it("valida con Meta, guarda el token cifrado, audita y no devuelve el token", async () => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            status: "CONNECTED",
            phoneNumberId: "111222333444555",
            wabaId: "999888777666555",
            displayPhoneNumber: "+1 555 000 1111",
            hasToken: true,
            lastConnectionTestOk: true,
        });
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
        expect(res.body).not.toHaveProperty("encryptedAccessToken");
        expect(getPhoneNumber).toHaveBeenCalledWith({ phoneNumberId: "111222333444555", accessToken: TOKEN });

        const stored = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantA.id } });
        expect(stored.encryptedAccessToken).not.toContain(TOKEN);
        expect(new AesGcmAdapter().decrypt(stored.encryptedAccessToken!)).toBe(TOKEN);

        const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "tenant.whatsapp.connect" } });
        expect(audit.result).toBe("SUCCESS");
        expect(JSON.stringify(audit)).not.toContain(TOKEN);
    });

    it("volver a conectar reemplaza el token de la misma conexión (200)", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        const NEW_TOKEN = "EAAB-token-renovado-9876543210";
        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body({ accessToken: NEW_TOKEN }));

        expect(res.status).toBe(200);
        expect(await prisma.whatsappConnection.count({ where: { tenantId: tenantA.id } })).toBe(1);
        const stored = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantA.id } });
        expect(new AesGcmAdapter().decrypt(stored.encryptedAccessToken!)).toBe(NEW_TOKEN);
    });

    it("rechaza un token que Meta no acepta (400), no guarda nada y audita el fallo", async () => {
        const { tenantA, auth } = await asAdminA();
        getPhoneNumber.mockRejectedValueOnce(new WhatsAppApiError(401, 190));

        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
        expect(await prisma.whatsappConnection.count()).toBe(0);
        expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "tenant.whatsapp.connect" } })).result).toBe("FAILURE");
    });

    it("responde 502 si Meta no está disponible", async () => {
        const { tenantA, auth } = await asAdminA();
        getPhoneNumber.mockRejectedValueOnce(new WhatsAppApiError(0));

        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        expect(res.status).toBe(502);
        expect(await prisma.whatsappConnection.count()).toBe(0);
    });

    it("un número ya conectado a otra empresa da 409 sin revelar de quién es", async () => {
        const { tenantA, tenantB, auth, adminB } = await asAdminA();
        const authB = bearer((await login(adminB.email)).accessToken);
        await api().put(`/tenants/${tenantB.id}/whatsapp`).set(...authB).send(body());

        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        expect(res.status).toBe(409);
        expect(JSON.stringify(res.body)).not.toContain(tenantB.id);
        expect(await prisma.whatsappConnection.count({ where: { tenantId: tenantA.id } })).toBe(0);
    });

    it.each([
        ["ids no numéricos", { phoneNumberId: "abc" }],
        ["token demasiado corto", { accessToken: "corto" }],
        ["token con espacios", { accessToken: "EAAB token con espacios 0123456789" }],
        ["waba vacío", { wabaId: "" }],
    ])("responde 400 con %s", async (_name, overrides) => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body(overrides));

        expect(res.status).toBe(400);
        expect(getPhoneNumber).not.toHaveBeenCalled();
    });
});

describe("estado y prueba de conexión", () => {
    it("GET devuelve 404 si no hay conexión y el estado cuando existe", async () => {
        const { tenantA, auth } = await asAdminA();
        expect((await api().get(`/tenants/${tenantA.id}/whatsapp`).set(...auth)).status).toBe(404);

        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());
        const res = await api().get(`/tenants/${tenantA.id}/whatsapp`).set(...auth);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("CONNECTED");
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    });

    it("check marca TOKEN_EXPIRED cuando Meta rechaza el token y vuelve a CONNECTED al recuperarse", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        getPhoneNumber.mockRejectedValueOnce(new WhatsAppApiError(400, 190));
        const expired = await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth);
        expect(expired.status).toBe(200);
        expect(expired.body).toMatchObject({ status: "TOKEN_EXPIRED", lastConnectionTestOk: false });
        expect(expired.body.statusDetail).toContain("expired");

        const ok = await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth);
        expect(ok.body).toMatchObject({ status: "CONNECTED", lastConnectionTestOk: true, statusDetail: null });
    });

    it("check no cambia el estado si Meta no está disponible", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        getPhoneNumber.mockRejectedValueOnce(new WhatsAppApiError(503));
        const res = await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth);

        expect(res.body).toMatchObject({ status: "CONNECTED", lastConnectionTestOk: false });
        expect(res.body.statusDetail).toContain("unavailable");
    });

    it("check marca ERROR si el token guardado no se puede descifrar", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());
        await prisma.whatsappConnection.updateMany({ where: { tenantId: tenantA.id }, data: { encryptedAccessToken: "basura.basura.basura" } });

        const res = await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth);

        expect(res.body.status).toBe("ERROR");
    });

    it("check sin conexión da 404", async () => {
        const { tenantA, auth } = await asAdminA();
        expect((await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth)).status).toBe(404);
    });
});

describe("desconectar", () => {
    it("borra el token, deja la conexión DISCONNECTED, audita y es idempotente", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());

        const res = await api().delete(`/tenants/${tenantA.id}/whatsapp`).set(...auth);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: "DISCONNECTED", hasToken: false });

        const stored = await prisma.whatsappConnection.findFirstOrThrow({ where: { tenantId: tenantA.id } });
        expect(stored.encryptedAccessToken).toBeNull();
        expect(stored.disconnectedAt).not.toBeNull();

        const again = await api().delete(`/tenants/${tenantA.id}/whatsapp`).set(...auth);
        expect(again.status).toBe(200);
        expect(await prisma.auditLog.count({ where: { action: "tenant.whatsapp.disconnect" } })).toBe(1);

        // Probar una conexión desconectada no llama a Meta
        getPhoneNumber.mockClear();
        expect((await api().post(`/tenants/${tenantA.id}/whatsapp/check`).set(...auth)).status).toBe(409);
        expect(getPhoneNumber).not.toHaveBeenCalled();

        // Se puede reconectar
        const reconnect = await api().put(`/tenants/${tenantA.id}/whatsapp`).set(...auth).send(body());
        expect(reconnect.status).toBe(200);
        expect(reconnect.body).toMatchObject({ status: "CONNECTED", hasToken: true, disconnectedAt: null });
    });

    it("desconectar sin conexión da 404", async () => {
        const { tenantA, auth } = await asAdminA();
        expect((await api().delete(`/tenants/${tenantA.id}/whatsapp`).set(...auth)).status).toBe(404);
    });
});
