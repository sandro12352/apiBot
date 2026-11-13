import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { AI_API_KEY, createTwoTenants } from "./helpers/seed";
import { AIProviderError } from "../src/config/adapters/ai-provider";
import { AesGcmAdapter } from "../src/config/adapters/aes-gcm.adapter";
import { GeminiProvider } from "../src/infrastructure/ai/gemini.provider";

// BYOK y asistente: solo TENANT_ADMIN, clave cifrada, validada al guardar y nunca devuelta.

let listModels: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
    await resetDb();
    listModels = vi
        .spyOn(GeminiProvider.prototype, "listModels")
        .mockResolvedValue([{ id: "gemini-test-model" }, { id: "gemini-other-model", displayName: "Otro" }]);
});
afterEach(() => vi.restoreAllMocks());

const asAdminA = async () => {
    const data = await createTwoTenants();
    const { accessToken } = await login(data.adminA.email);
    return { ...data, auth: bearer(accessToken) };
};

const credentialsUrl = (tenantId: string, provider = "GEMINI") => `/tenants/${tenantId}/ai-credentials/${provider}`;
const assistantBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Asistente de ventas",
    instructions: "Vendemos zapatillas. Atendemos de lunes a viernes.",
    ...overrides,
});

describe("permisos", () => {
    it("un MEMBER recibe 403, el administrador de otra empresa 404 y sin sesión 401", async () => {
        const { tenantA, memberA, adminB } = await createTwoTenants();
        const member = await login(memberA.email);
        const foreign = await login(adminB.email);

        for (const request of [
            () => api().get(`/tenants/${tenantA.id}/ai-credentials`),
            () => api().put(credentialsUrl(tenantA.id)).send({ apiKey: AI_API_KEY }),
            () => api().post(`${credentialsUrl(tenantA.id)}/test`),
            () => api().get(`${credentialsUrl(tenantA.id)}/models`),
            () => api().delete(credentialsUrl(tenantA.id)),
            () => api().get(`/tenants/${tenantA.id}/assistant`),
            () => api().put(`/tenants/${tenantA.id}/assistant`).send(assistantBody()),
        ]) {
            expect((await request().set(...bearer(member.accessToken))).status).toBe(403);
            expect((await request().set(...bearer(foreign.accessToken))).status).toBe(404);
            expect((await request()).status).toBe(401);
        }
        expect(listModels).not.toHaveBeenCalled();
        expect(await prisma.aiProviderCredential.count()).toBe(0);
    });
});

describe("guardar la clave", () => {
    it("la valida con el proveedor, la guarda cifrada, audita y no la devuelve", async () => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY, preferredModel: "gemini-test-model" });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            provider: "GEMINI",
            status: "VALID",
            maskedKey: "AIza…6789",
            preferredModel: "gemini-test-model",
        });
        expect(JSON.stringify(res.body)).not.toContain(AI_API_KEY);
        expect(res.body).not.toHaveProperty("encryptedApiKey");
        expect(listModels).toHaveBeenCalledWith(AI_API_KEY);

        const stored = await prisma.aiProviderCredential.findFirstOrThrow({ where: { tenantId: tenantA.id } });
        expect(stored.encryptedApiKey).not.toContain(AI_API_KEY);
        expect(new AesGcmAdapter().decrypt(stored.encryptedApiKey)).toBe(AI_API_KEY);

        const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "ai.credential.save" } });
        expect(audit.result).toBe("SUCCESS");
        expect(JSON.stringify(audit)).not.toContain(AI_API_KEY);
    });

    it("volver a guardar reemplaza la clave de la misma empresa", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        const NEW_KEY = "AIzaSy-clave-nueva-9876543210";
        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: NEW_KEY });

        expect(res.status).toBe(200);
        expect(await prisma.aiProviderCredential.count({ where: { tenantId: tenantA.id } })).toBe(1);
        const stored = await prisma.aiProviderCredential.findFirstOrThrow({ where: { tenantId: tenantA.id } });
        expect(new AesGcmAdapter().decrypt(stored.encryptedApiKey)).toBe(NEW_KEY);
    });

    it("rechaza una clave que el proveedor no acepta: 400, no guarda nada y audita el fallo", async () => {
        const { tenantA, auth } = await asAdminA();
        listModels.mockRejectedValueOnce(new AIProviderError("auth", 400));

        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).not.toContain(AI_API_KEY);
        expect(await prisma.aiProviderCredential.count()).toBe(0);
        expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "ai.credential.save" } })).result).toBe("FAILURE");
    });

    it("responde 502 si el proveedor no está disponible", async () => {
        const { tenantA, auth } = await asAdminA();
        listModels.mockRejectedValueOnce(new AIProviderError("unavailable"));

        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        expect(res.status).toBe(502);
        expect(await prisma.aiProviderCredential.count()).toBe(0);
    });

    it("rechaza un modelo que la clave no puede usar", async () => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY, preferredModel: "gemini-inexistente" });

        expect(res.status).toBe(400);
        expect(await prisma.aiProviderCredential.count()).toBe(0);
    });

    it.each([
        ["clave demasiado corta", { apiKey: "corta" }],
        ["clave con espacios", { apiKey: "AIzaSy clave con espacios 0123456789" }],
        ["sin clave", {}],
        ["modelo con caracteres no válidos", { apiKey: AI_API_KEY, preferredModel: "../../models" }],
    ])("responde 400 con %s y no llama al proveedor", async (_name, body) => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(credentialsUrl(tenantA.id)).set(...auth).send(body);

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body)).not.toContain("espacios 0123456789");
        expect(listModels).not.toHaveBeenCalled();
    });

    it("rechaza un proveedor desconocido (400) o aún sin adaptador (400)", async () => {
        const { tenantA, auth } = await asAdminA();

        expect((await api().put(credentialsUrl(tenantA.id, "OTRO")).set(...auth).send({ apiKey: AI_API_KEY })).status).toBe(400);
        expect((await api().put(credentialsUrl(tenantA.id, "OPENAI")).set(...auth).send({ apiKey: AI_API_KEY })).status).toBe(400);
        expect(await prisma.aiProviderCredential.count()).toBe(0);
    });
});

describe("listar, probar, modelos y borrar", () => {
    it("cada empresa solo ve sus propias claves", async () => {
        const { tenantA, tenantB, auth, adminB } = await asAdminA();
        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });
        const authB = bearer((await login(adminB.email)).accessToken);

        const a = await api().get(`/tenants/${tenantA.id}/ai-credentials`).set(...auth);
        const b = await api().get(`/tenants/${tenantB.id}/ai-credentials`).set(...authB);

        expect(a.body).toHaveLength(1);
        expect(JSON.stringify(a.body)).not.toContain(AI_API_KEY);
        expect(b.body).toEqual([]);
        expect((await api().post(`${credentialsUrl(tenantB.id)}/test`).set(...authB)).status).toBe(404);
    });

    it("test marca INVALID si el proveedor rechaza la clave y VALID cuando se recupera", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        listModels.mockRejectedValueOnce(new AIProviderError("auth", 400));
        const invalid = await api().post(`${credentialsUrl(tenantA.id)}/test`).set(...auth);
        expect(invalid.status).toBe(200);
        expect(invalid.body.status).toBe("INVALID");
        expect(invalid.body.statusDetail).toBeTruthy();

        const valid = await api().post(`${credentialsUrl(tenantA.id)}/test`).set(...auth);
        expect(valid.body).toMatchObject({ status: "VALID", statusDetail: null });
        expect(JSON.stringify(valid.body)).not.toContain(AI_API_KEY);
    });

    it("test no cambia el estado si el proveedor no está disponible", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        listModels.mockRejectedValueOnce(new AIProviderError("unavailable"));
        const res = await api().post(`${credentialsUrl(tenantA.id)}/test`).set(...auth);

        expect(res.status).toBe(502);
        expect((await prisma.aiProviderCredential.findFirstOrThrow({ where: { tenantId: tenantA.id } })).status).toBe("VALID");
    });

    it("models devuelve los modelos de la clave y 404 si no hay clave", async () => {
        const { tenantA, auth } = await asAdminA();
        expect((await api().get(`${credentialsUrl(tenantA.id)}/models`).set(...auth)).status).toBe(404);

        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });
        const res = await api().get(`${credentialsUrl(tenantA.id)}/models`).set(...auth);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([{ id: "gemini-test-model" }, { id: "gemini-other-model", displayName: "Otro" }]);
    });

    it("borrar elimina la clave, audita y da 404 la segunda vez", async () => {
        const { tenantA, auth } = await asAdminA();
        await api().put(credentialsUrl(tenantA.id)).set(...auth).send({ apiKey: AI_API_KEY });

        expect((await api().delete(credentialsUrl(tenantA.id)).set(...auth)).status).toBe(204);
        expect(await prisma.aiProviderCredential.count()).toBe(0);
        expect(await prisma.auditLog.count({ where: { action: "ai.credential.delete" } })).toBe(1);
        expect((await api().delete(credentialsUrl(tenantA.id)).set(...auth)).status).toBe(404);
    });
});

describe("asistente", () => {
    it("GET da 404 sin asistente; PUT lo crea y volver a llamar lo actualiza", async () => {
        const { tenantA, auth } = await asAdminA();
        const url = `/tenants/${tenantA.id}/assistant`;
        expect((await api().get(url).set(...auth)).status).toBe(404);

        const created = await api().put(url).set(...auth).send(assistantBody({ tone: "cercano", aiModel: "gemini-test-model" }));
        expect(created.status).toBe(200);
        expect(created.body).toMatchObject({ name: "Asistente de ventas", language: "es", tone: "cercano", aiModel: "gemini-test-model", isActive: true });

        const updated = await api().put(url).set(...auth).send(assistantBody({ name: "Nuevo nombre", tone: "" }));
        expect(updated.body).toMatchObject({ name: "Nuevo nombre", tone: null, aiModel: null });
        expect(await prisma.assistant.count({ where: { tenantId: tenantA.id } })).toBe(1);

        expect((await api().get(url).set(...auth)).body.name).toBe("Nuevo nombre");
        const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "assistant.update" } });
        expect(JSON.stringify(audit)).not.toContain("zapatillas");
    });

    it("cada empresa tiene su propio asistente", async () => {
        const { tenantA, tenantB, auth, adminB } = await asAdminA();
        const authB = bearer((await login(adminB.email)).accessToken);
        await api().put(`/tenants/${tenantA.id}/assistant`).set(...auth).send(assistantBody({ name: "De A" }));

        expect((await api().get(`/tenants/${tenantB.id}/assistant`).set(...authB)).status).toBe(404);
        await api().put(`/tenants/${tenantB.id}/assistant`).set(...authB).send(assistantBody({ name: "De B" }));

        expect((await api().get(`/tenants/${tenantA.id}/assistant`).set(...auth)).body.name).toBe("De A");
    });

    it.each([
        ["sin nombre", { name: "" }],
        ["sin instrucciones", { instructions: "" }],
        ["instrucciones demasiado largas", { instructions: "x".repeat(8001) }],
        ["idioma inválido", { language: "español" }],
        ["modelo inválido", { aiModel: "../x" }],
        ["proveedor inválido", { aiProvider: "OTRO" }],
    ])("responde 400 con %s", async (_name, overrides) => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().put(`/tenants/${tenantA.id}/assistant`).set(...auth).send(assistantBody(overrides));

        expect(res.status).toBe(400);
        expect(await prisma.assistant.count()).toBe(0);
    });
});
