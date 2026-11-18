import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createAiSetup, createTwoTenants, createWhatsappConnection, WA_PHONE_NUMBER_ID } from "./helpers/seed";
import { extractShowMarker } from "../src/domain";
import { GeminiProvider } from "../src/infrastructure/ai/gemini.provider";
import { WhatsAppCloudClient } from "../src/infrastructure/whatsapp-meta/whatsapp-cloud.client";
import { buildAiConversationHandler, buildMediaUrlSigner } from "../src/presentation/auth/auth.factory";

// Catálogo con imágenes: solo TENANT_ADMIN, aislado por empresa, imágenes privadas validadas por
// su contenido, enlaces firmados y el bot enviando hasta 3 fotos después del texto.

const STORAGE_DIR = process.env.STORAGE_DIR!;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(64, 3)]);

beforeAll(async () => {
    await rm(STORAGE_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
    await resetDb();
});
afterEach(() => vi.restoreAllMocks());

const asAdminA = async () => {
    const data = await createTwoTenants();
    const { accessToken } = await login(data.adminA.email);
    return { ...data, auth: bearer(accessToken) };
};

const url = (tenantId: string, path = "") => `/tenants/${tenantId}/catalog${path}`;

const product = (overrides: Record<string, unknown> = {}) => ({
    sku: "IP15PM-256",
    name: "iPhone 15 Pro Max 256GB",
    description: "Nuevo y sellado, 24 meses de garantía.",
    price: 4569,
    category: "Celulares",
    attributes: { color: "titanio negro", capacidad: "256GB" },
    ...overrides,
});

const upload = (tenantId: string, itemId: string, auth: [string, string], data: Buffer, type = "image/png") =>
    api().post(url(tenantId, `/${itemId}/images`)).set(...auth).set("Content-Type", type).send(data);

const fileOf = (storageKey: string) => join(STORAGE_DIR, storageKey);

describe("permisos", () => {
    it("un MEMBER recibe 403, el administrador de otra empresa 404 y sin sesión 401", async () => {
        const { tenantA, memberA, adminB } = await createTwoTenants();
        const item = await prisma.catalogItem.create({ data: { tenantId: tenantA.id, name: "Producto", price: 10, currency: "PEN" } });
        const member = await login(memberA.email);
        const foreign = await login(adminB.email);

        for (const request of [
            () => api().get(url(tenantA.id)),
            () => api().post(url(tenantA.id)).send(product()),
            () => api().get(url(tenantA.id, `/${item.id}`)),
            () => api().patch(url(tenantA.id, `/${item.id}`)).send({ price: 1 }),
            () => api().delete(url(tenantA.id, `/${item.id}`)),
            () => api().post(url(tenantA.id, `/${item.id}/images`)).set("Content-Type", "image/png").send(PNG),
            () => api().delete(url(tenantA.id, `/${item.id}/images/otra`)),
        ]) {
            expect((await request().set(...bearer(member.accessToken))).status).toBe(403);
            expect((await request().set(...bearer(foreign.accessToken))).status).toBe(404);
            expect((await request()).status).toBe(401);
        }
        expect(await prisma.catalogImage.count()).toBe(0);
    });
});

describe("productos", () => {
    it("crea con valores por defecto, lista, filtra, ve, edita y borra; audita", async () => {
        const { tenantA, auth } = await asAdminA();

        const created = await api().post(url(tenantA.id)).set(...auth).send(product());
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            sku: "IP15PM-256",
            name: "iPhone 15 Pro Max 256GB",
            price: "4569.00",
            currency: "PEN",
            status: "ACTIVE",
            attributes: { color: "titanio negro", capacidad: "256GB" },
            images: [],
        });

        await api().post(url(tenantA.id)).set(...auth).send(product({ sku: "FUNDA", name: "Funda", price: 49.9, category: "Accesorios", status: "INACTIVE" }));

        expect((await api().get(url(tenantA.id)).set(...auth)).body).toHaveLength(2);
        expect((await api().get(`${url(tenantA.id)}?status=ACTIVE`).set(...auth)).body.map((p: { name: string }) => p.name)).toEqual([
            "iPhone 15 Pro Max 256GB",
        ]);
        expect((await api().get(`${url(tenantA.id)}?category=Accesorios`).set(...auth)).body[0].price).toBe("49.90");

        const updated = await api()
            .patch(url(tenantA.id, `/${created.body.id}`))
            .set(...auth)
            .send({ price: 4299.5, attributes: null, description: "" });
        expect(updated.status).toBe(200);
        expect(updated.body).toMatchObject({ price: "4299.50", attributes: null, description: null, sku: "IP15PM-256" });

        expect((await api().delete(url(tenantA.id, `/${created.body.id}`)).set(...auth)).status).toBe(204);
        expect((await api().get(url(tenantA.id, `/${created.body.id}`)).set(...auth)).status).toBe(404);

        const actions = (await prisma.auditLog.findMany({ where: { tenantId: tenantA.id, resourceType: "catalog_item" } })).map((a) => a.action);
        expect(actions.sort()).toEqual(["catalog.create", "catalog.create", "catalog.delete", "catalog.update"].sort());
    });

    it("el SKU no se repite dentro de una empresa, pero sí puede repetirse en otra", async () => {
        const { tenantA, tenantB, auth, adminB } = await asAdminA();
        const authB = bearer((await login(adminB.email)).accessToken);

        expect((await api().post(url(tenantA.id)).set(...auth).send(product())).status).toBe(201);
        expect((await api().post(url(tenantA.id)).set(...auth).send(product({ name: "Otro" }))).status).toBe(409);
        expect((await api().post(url(tenantB.id)).set(...authB).send(product())).status).toBe(201);

        const other = await api().post(url(tenantA.id)).set(...auth).send(product({ sku: "OTRO" }));
        expect((await api().patch(url(tenantA.id, `/${other.body.id}`)).set(...auth).send({ sku: "IP15PM-256" })).status).toBe(409);
    });

    it.each([
        ["sin nombre", { name: "" }],
        ["precio negativo", { price: -1 }],
        ["precio con 3 decimales", { price: 10.555 }],
        ["precio como texto", { price: "10" }],
        ["moneda inválida", { currency: "SOLES" }],
        ["SKU con espacios", { sku: "con espacios" }],
        ["atributo con valor inválido", { attributes: { color: { r: 1 } } }],
        ["demasiados atributos", { attributes: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`a${i}`, i])) }],
        ["campo desconocido", { stock: 3 }],
    ])("crear responde 400 con %s", async (_name, overrides) => {
        const { tenantA, auth } = await asAdminA();

        expect((await api().post(url(tenantA.id)).set(...auth).send(product(overrides))).status).toBe(400);
        expect(await prisma.catalogItem.count()).toBe(0);
    });

    it("editar sin cambios o filtrar por un estado inválido responde 400", async () => {
        const { tenantA, auth } = await asAdminA();
        const created = await api().post(url(tenantA.id)).set(...auth).send(product());

        expect((await api().patch(url(tenantA.id, `/${created.body.id}`)).set(...auth).send({})).status).toBe(400);
        expect((await api().get(`${url(tenantA.id)}?status=BORRADO`).set(...auth)).status).toBe(400);
    });
});

describe("imágenes", () => {
    it("acepta PNG, JPEG y WebP, las guarda en privado y devuelve enlaces firmados", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;

        expect((await upload(tenantA.id, item.id, auth, PNG)).status).toBe(201);
        expect((await upload(tenantA.id, item.id, auth, JPEG, "image/jpeg")).status).toBe(201);
        const last = await upload(tenantA.id, item.id, auth, WEBP, "image/webp");

        expect(last.status).toBe(201);
        expect(last.body.images.map((image: { mimeType: string; position: number }) => [image.mimeType, image.position])).toEqual([
            ["image/png", 0],
            ["image/jpeg", 1],
            ["image/webp", 2],
        ]);
        // El panel recibe un enlace firmado, nunca la ruta interna del archivo
        expect(last.body.images[0].url).toMatch(/^https:\/\/bot\.example\.test\/media\/.+\?exp=\d+&sig=/);
        expect(last.body.images[0].storageKey).toBeUndefined();

        const stored = await prisma.catalogImage.findMany({ where: { itemId: item.id } });
        for (const image of stored) {
            expect(image.storageKey.startsWith(`${tenantA.id}/catalog/${item.id}/`)).toBe(true);
            expect(existsSync(fileOf(image.storageKey))).toBe(true);
        }
    });

    it("rechaza archivos que no son imágenes aunque digan serlo, tipos distintos al declarado y cuerpos vacíos", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;

        expect((await upload(tenantA.id, item.id, auth, Buffer.from("<script>alert(1)</script>"))).status).toBe(400);
        expect((await upload(tenantA.id, item.id, auth, JPEG, "image/png")).status).toBe(400);
        expect((await api().post(url(tenantA.id, `/${item.id}/images`)).set(...auth).send({ foto: "x" })).status).toBe(400);
        expect((await upload(tenantA.id, item.id, auth, PNG, "image/gif")).status).toBe(400);
        expect(await prisma.catalogImage.count()).toBe(0);
    });

    it("rechaza imágenes de más de 5 MB", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;
        const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);

        expect((await upload(tenantA.id, item.id, auth, big)).status).toBe(413);
        expect(await prisma.catalogImage.count()).toBe(0);
    });

    it("admite como máximo 5 imágenes por producto", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;
        for (let index = 0; index < 5; index++) {
            expect((await upload(tenantA.id, item.id, auth, PNG)).status).toBe(201);
        }

        expect((await upload(tenantA.id, item.id, auth, PNG)).status).toBe(409);
        expect(await prisma.catalogImage.count()).toBe(5);
    });

    it("borrar una imagen o el producto elimina también los archivos", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;
        const withImages = (await upload(tenantA.id, item.id, auth, PNG)).body;
        await upload(tenantA.id, item.id, auth, JPEG, "image/jpeg");
        const [first, second] = await prisma.catalogImage.findMany({ where: { itemId: item.id }, orderBy: { position: "asc" } });

        expect((await api().delete(url(tenantA.id, `/${item.id}/images/${withImages.images[0].id}`)).set(...auth)).status).toBe(204);
        expect(existsSync(fileOf(first!.storageKey))).toBe(false);
        expect(existsSync(fileOf(second!.storageKey))).toBe(true);

        expect((await api().delete(url(tenantA.id, `/${item.id}`)).set(...auth)).status).toBe(204);
        expect(existsSync(fileOf(second!.storageKey))).toBe(false);
        expect(await prisma.catalogImage.count()).toBe(0);
    });

    it("otra empresa no puede subir ni borrar imágenes de un producto ajeno", async () => {
        const { tenantA, tenantB, auth, adminB } = await asAdminA();
        const authB = bearer((await login(adminB.email)).accessToken);
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;
        const image = (await upload(tenantA.id, item.id, auth, PNG)).body.images[0];

        expect((await upload(tenantB.id, item.id, authB, PNG)).status).toBe(404);
        expect((await api().delete(url(tenantB.id, `/${item.id}/images/${image.id}`)).set(...authB)).status).toBe(404);
        expect(await prisma.catalogImage.count()).toBe(1);
    });
});

describe("enlaces firmados /media", () => {
    const pathOf = (link: string) => link.replace("https://bot.example.test", "");

    it("sirve la imagen con un enlace vigente y rechaza firmas alteradas, vencidas o claves inválidas", async () => {
        const { tenantA, auth } = await asAdminA();
        const item = (await api().post(url(tenantA.id)).set(...auth).send(product())).body;
        await upload(tenantA.id, item.id, auth, PNG);
        const { storageKey } = await prisma.catalogImage.findFirstOrThrow();
        const signer = buildMediaUrlSigner();

        const ok = await api().get(pathOf(signer.sign(storageKey, 60)!));
        expect(ok.status).toBe(200);
        expect(ok.headers["content-type"]).toContain("image/png");
        expect(Buffer.from(ok.body).equals(PNG)).toBe(true);

        const valid = pathOf(signer.sign(storageKey, 60)!);
        const tampered = valid.replace(/sig=(.)/, (_m, first: string) => `sig=${first === "A" ? "B" : "A"}`);
        expect(tampered).not.toBe(valid);
        expect((await api().get(tampered)).status).toBe(404);

        const expired = signer.sign(storageKey, 60, Date.now() - 10 * 60 * 1000)!;
        expect((await api().get(pathOf(expired))).status).toBe(404);

        expect((await api().get(`/media/${storageKey}`)).status).toBe(404);
        // Una firma válida para otra clave no sirve
        const other = signer.sign(`${tenantA.id}/catalog/otro/archivo.png`, 60)!;
        const exp = new URL(other).searchParams.get("exp");
        const sig = new URL(other).searchParams.get("sig");
        expect((await api().get(`/media/${storageKey}?exp=${exp}&sig=${sig}`)).status).toBe(404);
        expect((await api().get("/media/../../etc/passwd?exp=1&sig=x")).status).toBe(404);
    });
});

describe("el bot y el catálogo", () => {
    const CUSTOMER = "51911222333";
    const handler = buildAiConversationHandler();
    let generate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        generate = vi.spyOn(GeminiProvider.prototype, "generate").mockResolvedValue({ text: "Respuesta", inputTokens: 1, outputTokens: 1 });
    });

    const seedProduct = async (tenantId: string, data: { name: string; price: number; sku?: string; images?: number }) => {
        const item = await prisma.catalogItem.create({
            data: { tenantId, name: data.name, price: data.price, currency: "PEN", sku: data.sku ?? null, category: "Celulares" },
        });
        for (let index = 0; index < (data.images ?? 0); index++) {
            await prisma.catalogImage.create({
                data: { tenantId, itemId: item.id, storageKey: `${tenantId}/catalog/${item.id}/img-${index}.png`, mimeType: "image/png", sizeBytes: 10, position: index },
            });
        }
        return item;
    };

    const ask = (tenantId: string, connectionId: string, text: string) =>
        handler.handle({ tenantId, connectionId, from: CUSTOMER, text, isTest: false });

    it("el marcador de fotos nunca llega al cliente", () => {
        expect(extractShowMarker("Tenemos el iPhone 15 Pro Max a S/ 4,569.\n\n[[MOSTRAR: P1, p2, P1, X9]]")).toEqual({
            text: "Tenemos el iPhone 15 Pro Max a S/ 4,569.",
            refs: ["P1", "P2"],
        });
        expect(extractShowMarker("Sin fotos")).toEqual({ text: "Sin fotos", refs: [] });
    });

    it("pasa a la IA los productos relacionados con su precio oficial y envía hasta 3 fotos en orden", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await createAiSetup(tenant.id);
        await seedProduct(tenant.id, { name: "iPhone 15 Pro Max", price: 4569, sku: "IP15PM", images: 2 });
        await seedProduct(tenant.id, { name: "iPhone 16 Pro Max", price: 5299, images: 2 });
        await seedProduct(tenant.id, { name: "Cargador rápido", price: 89 });
        generate.mockResolvedValueOnce({ text: "Te muestro ambos modelos.\n[[MOSTRAR: P1, P2]]", inputTokens: 1, outputTokens: 1 });

        // "15" solo coincide con el primero: queda como P1 y el 16 como P2
        const reply = await ask(tenant.id, connection.id, "quiero el iphone 15 pro max");

        const prompt = (generate.mock.calls[0]![0] as { systemPrompt: string }).systemPrompt;
        expect(prompt).toContain("iPhone 15 Pro Max | Precio: S/ 4,569.00");
        expect(prompt).toContain("[[MOSTRAR: P1]]");
        expect(reply).toMatchObject({ text: "Te muestro ambos modelos." });
        const images = (reply as { images: { caption: string; storageKey: string }[] }).images;
        expect(images).toHaveLength(3);
        expect(images.map((image) => image.caption)).toEqual([
            "iPhone 15 Pro Max — S/ 4,569.00",
            "iPhone 15 Pro Max — S/ 4,569.00",
            "iPhone 16 Pro Max — S/ 5,299.00",
        ]);
    });

    it("no envía fotos si la IA no las pide, si inventa un código o si el producto no tiene fotos", async () => {
        const { tenant, connection } = await createWhatsappConnection();
        await createAiSetup(tenant.id);
        await seedProduct(tenant.id, { name: "Funda iPhone", price: 49 });

        generate.mockResolvedValueOnce({ text: "Sí, tenemos fundas.", inputTokens: 1, outputTokens: 1 });
        expect(await ask(tenant.id, connection.id, "tienen funda iphone?")).toEqual({ text: "Sí, tenemos fundas.", images: [] });

        generate.mockResolvedValueOnce({ text: "Mira:\n[[MOSTRAR: P7]]", inputTokens: 1, outputTokens: 1 });
        expect(await ask(tenant.id, connection.id, "funda iphone")).toEqual({ text: "Mira:", images: [] });

        generate.mockResolvedValueOnce({ text: "Aquí está:\n[[MOSTRAR: P1]]", inputTokens: 1, outputTokens: 1 });
        expect(await ask(tenant.id, connection.id, "funda iphone")).toEqual({ text: "Aquí está:", images: [] });
    });

    it("no usa productos inactivos ni de otra empresa", async () => {
        const a = await createWhatsappConnection();
        const b = await createWhatsappConnection({ phoneNumberId: "999000111222333" });
        await createAiSetup(a.tenant.id);
        await createAiSetup(b.tenant.id);
        await seedProduct(b.tenant.id, { name: "iPhone de otra empresa", price: 1 });
        const inactive = await seedProduct(a.tenant.id, { name: "iPhone descontinuado", price: 2 });
        await prisma.catalogItem.update({ where: { id: inactive.id }, data: { status: "INACTIVE" } });

        await ask(a.tenant.id, a.connection.id, "iphone");

        const prompt = (generate.mock.calls[0]![0] as { systemPrompt: string }).systemPrompt;
        expect(prompt).not.toContain("otra empresa");
        expect(prompt).not.toContain("descontinuado");
    });

    describe("por WhatsApp", () => {
        const sign = (body: string) => `sha256=${createHmac("sha256", "test-app-secret").update(body).digest("hex")}`;
        const post = (id: string, text: string) => {
            const body = JSON.stringify({
                object: "whatsapp_business_account",
                entry: [{
                    id: "waba-test",
                    changes: [{
                        field: "messages",
                        value: {
                            messaging_product: "whatsapp",
                            metadata: { phone_number_id: WA_PHONE_NUMBER_ID },
                            messages: [{ from: CUSTOMER, id, timestamp: "1700000000", type: "text", text: { body: text } }],
                        },
                    }],
                }],
            });
            return api().post("/webhooks/meta").set("Content-Type", "application/json").set("X-Hub-Signature-256", sign(body)).send(body);
        };

        it("envía primero el texto y después las fotos con enlaces firmados; si una foto falla, el mensaje no se reintenta", async () => {
            const { tenant } = await createWhatsappConnection();
            await createAiSetup(tenant.id);
            await seedProduct(tenant.id, { name: "iPhone 15 Pro Max", price: 4569, images: 2 });
            const order: string[] = [];
            vi.spyOn(WhatsAppCloudClient.prototype, "sendText").mockImplementation(async ({ body }) => {
                order.push(`text:${body}`);
                return { messageId: "t" };
            });
            const sendImage = vi
                .spyOn(WhatsAppCloudClient.prototype, "sendImage")
                .mockImplementationOnce(async ({ caption }) => {
                    order.push(`image:${caption}`);
                    throw new Error("WhatsApp send failed (HTTP 400)");
                })
                .mockImplementation(async ({ caption }) => {
                    order.push(`image:${caption}`);
                    return { messageId: "i" };
                });

            // Primer mensaje: solo la bienvenida
            await post("wamid.C1", "hola");
            await vi.waitFor(async () => expect(await prisma.conversationContext.count()).toBe(2));
            order.length = 0;

            generate.mockResolvedValueOnce({ text: "Lo tenemos en S/ 4,569.\n[[MOSTRAR: P1]]", inputTokens: 1, outputTokens: 1 });
            await post("wamid.C2", "quiero el iphone 15 pro max");

            await vi.waitFor(async () => {
                expect((await prisma.webhookEvent.findFirstOrThrow({ where: { externalId: "wamid.C2" } })).status).toBe("PROCESSED");
            });
            expect(order).toEqual([
                "text:Lo tenemos en S/ 4,569.",
                "image:iPhone 15 Pro Max — S/ 4,569.00",
                "image:iPhone 15 Pro Max — S/ 4,569.00",
            ]);
            expect(sendImage.mock.calls[1]![0].link).toMatch(/^https:\/\/bot\.example\.test\/media\/.+\?exp=\d+&sig=/);
        });
    });
});
