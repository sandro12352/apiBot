import { beforeEach, describe, expect, it } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createTwoTenants, createUser } from "./helpers/seed";

// Criterio de aceptación §17: una empresa no puede consultar ni modificar datos de otra.

describe("aislamiento entre empresas", () => {
    beforeEach(resetDb);

    it("el administrador de A no puede ver ni modificar la empresa B (404, no revela si existe)", async () => {
        const { tenantB, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const get = await api().get(`/tenants/${tenantB.id}`).set(...bearer(accessToken));
        const patch = await api().patch(`/tenants/${tenantB.id}`).set(...bearer(accessToken)).send({ name: "Hackeada" });
        const members = await api().get(`/tenants/${tenantB.id}/members`).set(...bearer(accessToken));

        expect(get.status).toBe(404);
        expect(patch.status).toBe(404);
        expect(members.status).toBe(404);
        expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantB.id } })).name).toBe("Empresa B");
    });

    it("la respuesta de una empresa ajena es idéntica a la de una empresa inexistente", async () => {
        const { tenantB, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const foreign = await api().get(`/tenants/${tenantB.id}`).set(...bearer(accessToken));
        const missing = await api().get("/tenants/00000000-0000-0000-0000-000000000000").set(...bearer(accessToken));

        expect(foreign.status).toBe(missing.status);
        expect(foreign.body).toEqual(missing.body);
    });

    it("un tenantId mal formado devuelve 404", async () => {
        const { adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().get("/tenants/no-es-un-uuid").set(...bearer(accessToken));
        expect(res.status).toBe(404);
    });

    it("el administrador de A sí accede a su propia empresa y ve su rol", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().get(`/tenants/${tenantA.id}`).set(...bearer(accessToken));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ id: tenantA.id, role: "TENANT_ADMIN" });
    });

    it("un MEMBER puede ver su empresa pero no modificarla (403)", async () => {
        const { tenantA, memberA } = await createTwoTenants();
        const { accessToken } = await login(memberA.email);

        const get = await api().get(`/tenants/${tenantA.id}`).set(...bearer(accessToken));
        const patch = await api().patch(`/tenants/${tenantA.id}`).set(...bearer(accessToken)).send({ name: "Nuevo" });

        expect(get.status).toBe(200);
        expect(get.body.role).toBe("MEMBER");
        expect(patch.status).toBe(403);
    });

    it("el administrador de plataforma NO tiene acceso automático a /tenants/:id, solo a /admin", async () => {
        const { tenantA } = await createTwoTenants();
        const platformAdmin = await createUser({ email: "platform@example.com", isPlatformAdmin: true });
        const { accessToken } = await login(platformAdmin.email);

        const tenantRoute = await api().get(`/tenants/${tenantA.id}`).set(...bearer(accessToken));
        const adminRoute = await api().get("/admin/tenants").set(...bearer(accessToken));

        expect(tenantRoute.status).toBe(404);
        expect(adminRoute.status).toBe(200);
        expect(adminRoute.body).toHaveLength(2);
    });

    it("un administrador de empresa no accede a /admin (403)", async () => {
        const { adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().get("/admin/tenants").set(...bearer(accessToken));
        expect(res.status).toBe(403);
    });

    it("sin token o con token falso: 401", async () => {
        const { tenantA } = await createTwoTenants();

        const none = await api().get(`/tenants/${tenantA.id}`);
        const fake = await api().get(`/tenants/${tenantA.id}`).set(...bearer("no.es.un.jwt"));

        expect(none.status).toBe(401);
        expect(fake.status).toBe(401);
    });

    it("una empresa suspendida bloquea a todos sus miembros (403)", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);
        await prisma.tenant.update({ where: { id: tenantA.id }, data: { status: "SUSPENDED" } });

        const res = await api().get(`/tenants/${tenantA.id}`).set(...bearer(accessToken));
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("Tenant is not active");
    });

    it("el cambio de nombre queda auditado con el actor y la empresa", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().patch(`/tenants/${tenantA.id}`).set(...bearer(accessToken)).send({ name: "Empresa A SAC" });
        expect(res.status).toBe(200);

        const audit = await prisma.auditLog.findFirst({ where: { action: "tenant.update", tenantId: tenantA.id } });
        expect(audit).toMatchObject({ actorUserId: adminA.id, result: "SUCCESS" });
    });
});
