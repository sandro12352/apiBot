import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createAiSetup, createTwoTenants, createWhatsappConnection } from "./helpers/seed";
import { KNOWLEDGE_BUDGET_CHARS, KNOWLEDGE_MAX_ENTRIES } from "../src/domain";
import { GeminiProvider } from "../src/infrastructure/ai/gemini.provider";
import { KnowledgeDatasourceImpl } from "../src/infrastructure/datasource/knowledge.datasource.impl";
import { buildAiConversationHandler } from "../src/presentation/auth/auth.factory";

// Base de conocimiento (FAQ y textos): solo TENANT_ADMIN, aislada por empresa, buscada en español
// sin tildes y usada por la IA como fuente al responder. Nunca se llama a Gemini.

beforeEach(async () => {
    await resetDb();
});
afterEach(() => vi.restoreAllMocks());

const asAdminA = async () => {
    const data = await createTwoTenants();
    const { accessToken } = await login(data.adminA.email);
    return { ...data, auth: bearer(accessToken) };
};

const url = (tenantId: string, id?: string) => `/tenants/${tenantId}/knowledge${id ? `/${id}` : ""}`;

const faq = (overrides: Record<string, unknown> = {}) => ({
    type: "FAQ",
    title: "¿Hacen envíos a provincia?",
    content: "Sí, por *Olva Courier*, de 2 a 4 días hábiles. Costo: S/ 15.",
    ...overrides,
});

const seedEntry = (tenantId: string, data: { type?: "FAQ" | "TEXT"; title: string; content: string; isActive?: boolean }) =>
    prisma.knowledgeSource.create({
        data: { tenantId, type: data.type ?? "FAQ", title: data.title, content: data.content, isActive: data.isActive ?? true, status: "READY" },
    });

describe("permisos", () => {
    it("un MEMBER recibe 403, el administrador de otra empresa 404 y sin sesión 401", async () => {
        const { tenantA, memberA, adminB } = await createTwoTenants();
        const entry = await seedEntry(tenantA.id, { title: "Horario", content: "Lunes a viernes" });
        const member = await login(memberA.email);
        const foreign = await login(adminB.email);

        for (const request of [
            () => api().get(url(tenantA.id)),
            () => api().post(url(tenantA.id)).send(faq()),
            () => api().get(url(tenantA.id, entry.id)),
            () => api().patch(url(tenantA.id, entry.id)).send({ title: "Otro" }),
            () => api().delete(url(tenantA.id, entry.id)),
        ]) {
            expect((await request().set(...bearer(member.accessToken))).status).toBe(403);
            expect((await request().set(...bearer(foreign.accessToken))).status).toBe(404);
            expect((await request()).status).toBe(401);
        }
        expect(await prisma.knowledgeSource.count()).toBe(1);
    });
});

describe("gestión de FAQ y textos", () => {
    it("crea, lista, filtra, ve, edita y borra; audita sin guardar el contenido", async () => {
        const { tenantA, auth } = await asAdminA();

        const created = await api().post(url(tenantA.id)).set(...auth).send(faq());
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ type: "FAQ", title: "¿Hacen envíos a provincia?", isActive: true });
        // El formato de WhatsApp se guarda tal cual
        expect(created.body.content).toContain("*Olva Courier*");

        const text = await api()
            .post(url(tenantA.id))
            .set(...auth)
            .send({ type: "TEXT", title: "Garantía", content: "12 meses por defecto de fábrica.\n- No cubre golpes." });
        expect(text.status).toBe(201);

        expect((await api().get(url(tenantA.id)).set(...auth)).body).toHaveLength(2);
        const onlyFaq = await api().get(`${url(tenantA.id)}?type=FAQ`).set(...auth);
        expect(onlyFaq.body.map((entry: { type: string }) => entry.type)).toEqual(["FAQ"]);

        expect((await api().get(url(tenantA.id, created.body.id)).set(...auth)).body.title).toBe("¿Hacen envíos a provincia?");

        const updated = await api().patch(url(tenantA.id, created.body.id)).set(...auth).send({ content: "Sí, en 3 días.", isActive: false });
        expect(updated.status).toBe(200);
        expect(updated.body).toMatchObject({ type: "FAQ", content: "Sí, en 3 días.", isActive: false });

        expect((await api().delete(url(tenantA.id, created.body.id)).set(...auth)).status).toBe(204);
        expect((await api().get(url(tenantA.id, created.body.id)).set(...auth)).status).toBe(404);

        const audits = await prisma.auditLog.findMany({ where: { tenantId: tenantA.id, resourceType: "knowledge" } });
        expect(audits.map((audit) => audit.action).sort()).toEqual(
            ["knowledge.create", "knowledge.create", "knowledge.delete", "knowledge.update"].sort(),
        );
        expect(JSON.stringify(audits)).not.toContain("Olva");
    });

    it("una empresa no ve, no edita ni borra entradas de otra", async () => {
        const { tenantA, tenantB, adminB } = await asAdminA();
        const authB = bearer((await login(adminB.email)).accessToken);
        const entryA = await seedEntry(tenantA.id, { title: "Secreto de A", content: "Solo A" });

        expect((await api().get(url(tenantB.id)).set(...authB)).body).toEqual([]);
        // Aunque B conozca el id, en su empresa no existe
        expect((await api().get(url(tenantB.id, entryA.id)).set(...authB)).status).toBe(404);
        expect((await api().patch(url(tenantB.id, entryA.id)).set(...authB).send({ title: "x" })).status).toBe(404);
        expect((await api().delete(url(tenantB.id, entryA.id)).set(...authB)).status).toBe(404);
        expect((await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: entryA.id } })).title).toBe("Secreto de A");
    });

    it.each([
        ["tipo inválido", { type: "PDF" }],
        ["sin título", { title: "" }],
        ["título demasiado largo", { title: "x".repeat(201) }],
        ["sin contenido", { content: "   " }],
        ["contenido demasiado largo", { content: "x".repeat(4001) }],
        ["campo desconocido", { extra: true }],
    ])("crear responde 400 con %s", async (_name, overrides) => {
        const { tenantA, auth } = await asAdminA();

        const res = await api().post(url(tenantA.id)).set(...auth).send(faq(overrides));

        expect(res.status).toBe(400);
        expect(await prisma.knowledgeSource.count()).toBe(0);
    });

    it("editar sin cambios, cambiando el tipo o filtrar por un tipo inválido responde 400", async () => {
        const { tenantA, auth } = await asAdminA();
        const entry = await seedEntry(tenantA.id, { title: "Horario", content: "9 a 6" });

        expect((await api().patch(url(tenantA.id, entry.id)).set(...auth).send({})).status).toBe(400);
        expect((await api().patch(url(tenantA.id, entry.id)).set(...auth).send({ type: "TEXT" })).status).toBe(400);
        expect((await api().get(`${url(tenantA.id)}?type=OTRO`).set(...auth)).status).toBe(400);
    });

    it(`no permite más de ${KNOWLEDGE_MAX_ENTRIES} entradas por empresa`, async () => {
        const { tenantA, tenantB, auth } = await asAdminA();
        await prisma.knowledgeSource.createMany({
            data: Array.from({ length: KNOWLEDGE_MAX_ENTRIES }, (_, index) => ({
                tenantId: tenantA.id,
                type: "FAQ" as const,
                title: `Pregunta ${index}`,
                content: "Respuesta",
                status: "READY" as const,
            })),
        });

        expect((await api().post(url(tenantA.id)).set(...auth).send(faq())).status).toBe(409);
        // El límite es por empresa
        await seedEntry(tenantB.id, { title: "De B", content: "Ok" });
        expect(await prisma.knowledgeSource.count({ where: { tenantId: tenantB.id } })).toBe(1);
    });
});

describe("búsqueda", () => {
    const datasource = new KnowledgeDatasourceImpl();

    it("encuentra sin importar tildes ni mayúsculas, con que coincida una palabra, y ordena por relevancia", async () => {
        const { tenantA } = await createTwoTenants();
        await seedEntry(tenantA.id, { title: "¿Hacen envíos a provincia?", content: "Sí, por Olva, de 2 a 4 días." });
        await seedEntry(tenantA.id, { type: "TEXT", title: "Horario de atención", content: "Lunes a sábado de 9:00 a 19:00." });
        await seedEntry(tenantA.id, { title: "¿Aceptan Yape?", content: "Sí, aceptamos Yape y Plin." });

        // Sin tildes y en mayúsculas: el "Sí" de las respuestas no cuenta como coincidencia
        const sinTildes = await datasource.search(tenantA.id, "HACEN ENVIOS A AREQUIPA?", 5);
        expect(sinTildes.map((entry) => entry.title)).toEqual(["¿Hacen envíos a provincia?"]);

        // La entrada que coincide en más palabras va primero
        const ranking = await datasource.search(tenantA.id, "quiero saber si hacen envíos", 5);
        expect(ranking[0]?.title).toBe("¿Hacen envíos a provincia?");
        expect(ranking.map((entry) => entry.title)).not.toContain("¿Aceptan Yape?");

        const horario = await datasource.search(tenantA.id, "¿a qué hora atienden el sábado?", 5);
        expect(horario[0]?.title).toBe("Horario de atención");

        expect(await datasource.search(tenantA.id, "hola buenas", 5)).toEqual([]);
    });

    it("no devuelve entradas inactivas ni de otra empresa", async () => {
        const { tenantA, tenantB } = await createTwoTenants();
        await seedEntry(tenantA.id, { title: "Envíos", content: "Por Olva", isActive: false });
        await seedEntry(tenantB.id, { title: "Envíos", content: "Por Shalom" });

        expect(await datasource.search(tenantA.id, "envíos", 5)).toEqual([]);
        expect((await datasource.search(tenantB.id, "envíos", 5)).map((entry) => entry.content)).toEqual(["Por Shalom"]);
    });
});

describe("uso en la respuesta de la IA", () => {
    const handler = buildAiConversationHandler();
    let generate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        generate = vi.spyOn(GeminiProvider.prototype, "generate").mockResolvedValue({ text: "Respuesta", inputTokens: 1, outputTokens: 1 });
    });

    const promptFor = async (tenantId: string, connectionId: string, text: string): Promise<string> => {
        await handler.handle({ tenantId, connectionId, from: "51911222333", text, isTest: false });
        return (generate.mock.calls.at(-1)![0] as { systemPrompt: string }).systemPrompt;
    };

    it("con poca información la envía toda, sin las entradas inactivas", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await createAiSetup(tenant.id);
        await seedEntry(tenant.id, { title: "¿Hacen envíos a provincia?", content: "Sí, por Olva Courier." });
        await seedEntry(tenant.id, { type: "TEXT", title: "Garantía", content: "12 meses." });
        await seedEntry(tenant.id, { title: "Promoción vieja", content: "2x1", isActive: false });

        const prompt = await promptFor(tenant.id, connection.id, "hola");

        expect(prompt).toContain("[Pregunta frecuente] ¿Hacen envíos a provincia?\nRespuesta: Sí, por Olva Courier.");
        expect(prompt).toContain("[Información] Garantía\n12 meses.");
        expect(prompt).not.toContain("2x1");
    });

    it("con mucha información envía solo lo relacionado con la pregunta", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await createAiSetup(tenant.id);
        const filler = "texto de relleno sin relación alguna con nada ".repeat(30);
        for (let index = 0; index < 10; index++) {
            await seedEntry(tenant.id, { type: "TEXT", title: `Relleno ${index}`, content: filler });
        }
        await seedEntry(tenant.id, { title: "¿Hacen envíos a provincia?", content: "Sí, por Olva Courier." });

        const prompt = await promptFor(tenant.id, connection.id, "¿hacen envíos a Arequipa?");

        expect(prompt).toContain("¿Hacen envíos a provincia?");
        expect(prompt).not.toContain("Relleno 3");
        expect(prompt.length).toBeLessThan(KNOWLEDGE_BUDGET_CHARS + 4000);
    });

    it("sin base de conocimiento el prompt no incluye la sección", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await createAiSetup(tenant.id);

        expect(await promptFor(tenant.id, connection.id, "hola")).not.toContain("Base de conocimiento");
    });

    it("la información de una empresa nunca llega al prompt de otra", async () => {
        const a = await createWhatsappConnection();
        const b = await createWhatsappConnection({ phoneNumberId: "999000111222333" });
        await createAiSetup(a.tenant.id);
        await createAiSetup(b.tenant.id);
        await seedEntry(a.tenant.id, { title: "Envíos de A", content: "Dato privado de A" });

        expect(await promptFor(b.tenant.id, b.connection.id, "¿hacen envíos?")).not.toContain("Dato privado de A");
    });
});
