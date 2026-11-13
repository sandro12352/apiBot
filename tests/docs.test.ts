import { describe, expect, it } from "vitest";
import { api } from "./helpers/api";

describe("documentación Swagger en /docs", () => {
    it("sirve la interfaz de Swagger UI sin autenticación", async () => {
        const res = await api().get("/docs/");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("text/html");
        expect(res.text).toContain("swagger-ui");
    });

    it("publica el documento OpenAPI con los módulos principales", async () => {
        const res = await api().get("/docs/openapi.json");

        expect(res.status).toBe(200);
        expect(res.body.openapi).toBe("3.1.0");
        for (const path of [
            "/auth/login",
            "/tenants/{tenantId}/members",
            "/tenants/{tenantId}/whatsapp",
            "/tenants/{tenantId}/ai-credentials/{provider}",
            "/tenants/{tenantId}/ai-credentials/{provider}/models",
            "/tenants/{tenantId}/assistant",
            "/admin/clients",
        ]) {
            expect(res.body.paths, path).toHaveProperty(path);
        }
        // El webhook de Meta no es para el front
        expect(JSON.stringify(res.body.paths)).not.toContain("/webhooks");
    });

    it("cada referencia $ref apunta a un esquema que existe", async () => {
        const res = await api().get("/docs/openapi.json");
        const names = Object.keys(res.body.components.schemas);
        const refs = [...JSON.stringify(res.body).matchAll(/#\/components\/schemas\/(\w+)/g)].map((m) => m[1]!);

        expect(refs.length).toBeGreaterThan(0);
        for (const name of refs) expect(names, name).toContain(name);
    });

    it("el resto de la API conserva las cabeceras de seguridad de helmet", async () => {
        const res = await api().get("/auth/me");

        expect(res.headers["content-security-policy"]).toBeTruthy();
    });
});
