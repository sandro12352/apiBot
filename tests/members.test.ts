import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { MemberDatasourceImpl } from "../src/infrastructure/datasource/member.datasource.impl";
import { addMember, createTenant, createTwoTenants, createUser, PASSWORD } from "./helpers/seed";

// Gestión de miembros: solo TENANT_ADMIN, siempre dentro de SU empresa y sin dejarla sin administrador.

// El adaptador de consola imprime el correo; se captura para extraer el enlace del token
let printed: string[] = [];
beforeEach(async () => {
    await resetDb();
    printed = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
        printed.push(args.join(" "));
    });
});
afterEach(() => vi.restoreAllMocks());

const lastSetupToken = (): string => {
    const text = printed.reverse().find((line) => line.includes("/set-password?token="));
    const token = text?.match(/token=([a-f0-9]{64})/)?.[1];
    if (!token) throw new Error("No se encontró el enlace de definición de contraseña en el correo");
    return token;
};

describe("alta de miembros", () => {
    it("crea usuario sin contraseña + membresía, audita y envía el enlace; el miembro define su contraseña y entra", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api()
            .post(`/tenants/${tenantA.id}/members`)
            .set(...bearer(accessToken))
            .send({ email: "Nuevo.Miembro@Example.com" });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ email: "nuevo.miembro@example.com", role: "MEMBER", passwordSet: false });
        expect(res.body).not.toHaveProperty("passwordHash");

        const created = await prisma.user.findUniqueOrThrow({ where: { email: "nuevo.miembro@example.com" } });
        expect(created.passwordHash).toBeNull();
        expect(await prisma.tenantMembership.count({ where: { tenantId: tenantA.id, userId: created.id } })).toBe(1);
        expect(await prisma.auditLog.count({ where: { action: "tenant.member.add", tenantId: tenantA.id } })).toBe(1);

        // El miembro define su contraseña con el enlace del correo (debe aceptar términos)
        const token = lastSetupToken();
        const noTerms = await api().post("/auth/reset-password").send({ token, password: "ClaveNueva123!" });
        expect(noTerms.status).toBe(400);
        const set = await api()
            .post("/auth/reset-password")
            .send({ token, password: "ClaveNueva123!", acceptPrivacy: true, acceptTerms: true });
        expect(set.status).toBe(200);

        const { accessToken: memberToken } = await login("nuevo.miembro@example.com", "ClaveNueva123!");
        const me = await api().get("/auth/me").set(...bearer(memberToken));
        expect(me.body.tenants).toEqual([expect.objectContaining({ id: tenantA.id, role: "MEMBER" })]);
    });

    it("un email que ya tiene cuenta se rechaza con 409 y mensaje genérico (no se vincula sin consentimiento)", async () => {
        const { tenantA, adminA, adminB } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const ofOtherTenant = await api()
            .post(`/tenants/${tenantA.id}/members`)
            .set(...bearer(accessToken))
            .send({ email: adminB.email });
        const alreadyMember = await api()
            .post(`/tenants/${tenantA.id}/members`)
            .set(...bearer(accessToken))
            .send({ email: adminA.email });

        expect(ofOtherTenant.status).toBe(409);
        expect(alreadyMember.status).toBe(409);
        expect(ofOtherTenant.body).toEqual(alreadyMember.body);
        // adminB sigue solo en su empresa
        expect(await prisma.tenantMembership.count({ where: { userId: adminB.id } })).toBe(1);
    });

    it("valida el cuerpo: email inválido o rol desconocido → 400", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);
        const post = (body: object) =>
            api().post(`/tenants/${tenantA.id}/members`).set(...bearer(accessToken)).send(body);

        expect((await post({ email: "no-es-email" })).status).toBe(400);
        expect((await post({ email: "ok@example.com", role: "SUPERADMIN" })).status).toBe(400);
    });

    it("un MEMBER no puede gestionar miembros (403) y el administrador de otra empresa no ve nada (404)", async () => {
        const { tenantA, memberA, adminB } = await createTwoTenants();
        const asMember = await login(memberA.email);
        const asOtherAdmin = await login(adminB.email);

        const list = await api().get(`/tenants/${tenantA.id}/members`).set(...bearer(asMember.accessToken));
        const add = await api()
            .post(`/tenants/${tenantA.id}/members`)
            .set(...bearer(asMember.accessToken))
            .send({ email: "x@example.com" });
        const foreign = await api().get(`/tenants/${tenantA.id}/members`).set(...bearer(asOtherAdmin.accessToken));

        expect(list.status).toBe(403);
        expect(add.status).toBe(403);
        expect(foreign.status).toBe(404);
        expect(await prisma.user.count({ where: { email: "x@example.com" } })).toBe(0);
    });

    it("el listado solo incluye miembros de la propia empresa", async () => {
        const { tenantA, adminA, memberA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().get(`/tenants/${tenantA.id}/members`).set(...bearer(accessToken));
        expect(res.status).toBe(200);
        expect(res.body.map((m: { email: string }) => m.email).sort()).toEqual([adminA.email, memberA.email].sort());
    });
});

describe("cambio de rol y baja", () => {
    it("el administrador puede ascender a un miembro y degradarlo después; ambos cambios se auditan", async () => {
        const { tenantA, adminA, memberA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);
        const patch = (role: string) =>
            api().patch(`/tenants/${tenantA.id}/members/${memberA.id}`).set(...bearer(accessToken)).send({ role });

        expect((await patch("TENANT_ADMIN")).body.role).toBe("TENANT_ADMIN");
        expect((await patch("MEMBER")).body.role).toBe("MEMBER");
        expect(await prisma.auditLog.count({ where: { action: "tenant.member.role", tenantId: tenantA.id } })).toBe(2);
    });

    it("no se puede degradar ni quitar al último administrador (409)", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const demote = await api()
            .patch(`/tenants/${tenantA.id}/members/${adminA.id}`)
            .set(...bearer(accessToken))
            .send({ role: "MEMBER" });
        const remove = await api().delete(`/tenants/${tenantA.id}/members/${adminA.id}`).set(...bearer(accessToken));

        expect(demote.status).toBe(409);
        expect(remove.status).toBe(409);
        expect(await prisma.tenantMembership.count({ where: { tenantId: tenantA.id, role: "TENANT_ADMIN" } })).toBe(1);
    });

    it("con dos administradores, dos degradaciones simultáneas nunca dejan la empresa sin administrador", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const secondAdmin = await createUser({ email: "admin-a2@example.com" });
        await addMember(tenantA.id, secondAdmin.id, "TENANT_ADMIN");
        const first = await login(adminA.email);
        const second = await login(secondAdmin.email);

        // Cada administrador intenta degradar al otro a la vez
        const [r1, r2] = await Promise.all([
            api().patch(`/tenants/${tenantA.id}/members/${secondAdmin.id}`).set(...bearer(first.accessToken)).send({ role: "MEMBER" }),
            api().patch(`/tenants/${tenantA.id}/members/${adminA.id}`).set(...bearer(second.accessToken)).send({ role: "MEMBER" }),
        ]);

        expect([r1.status, r2.status].sort()).toEqual([200, 409]);
        expect(await prisma.tenantMembership.count({ where: { tenantId: tenantA.id, role: "TENANT_ADMIN" } })).toBe(1);
    });

    // A nivel de datasource (sin HTTP) hay paralelismo real: sin el bloqueo de la fila del
    // tenant, varias degradaciones leen "quedan N administradores" a la vez y dejan 0.
    it("seis administradores degradándose a la vez: exactamente uno se queda", async () => {
        const tenant = await createTenant("Carrera");
        const admins = await Promise.all(
            Array.from({ length: 6 }, (_, i) => createUser({ email: `carrera-${i}@example.com` })),
        );
        for (const admin of admins) await addMember(tenant.id, admin.id, "TENANT_ADMIN");

        const datasource = new MemberDatasourceImpl();
        const results = await Promise.all(admins.map((admin) => datasource.changeRole(tenant.id, admin.id, "MEMBER")));

        expect(results.filter((r) => r.status === "ok")).toHaveLength(5);
        expect(results.filter((r) => r.status === "last_admin")).toHaveLength(1);
        expect(await prisma.tenantMembership.count({ where: { tenantId: tenant.id, role: "TENANT_ADMIN" } })).toBe(1);
    });

    it("seis bajas simultáneas de administradores: exactamente uno se queda", async () => {
        const tenant = await createTenant("Carrera bajas");
        const admins = await Promise.all(
            Array.from({ length: 6 }, (_, i) => createUser({ email: `baja-${i}@example.com` })),
        );
        for (const admin of admins) await addMember(tenant.id, admin.id, "TENANT_ADMIN");

        const datasource = new MemberDatasourceImpl();
        const results = await Promise.all(admins.map((admin) => datasource.remove(tenant.id, admin.id)));

        expect(results.filter((r) => r.status === "ok")).toHaveLength(5);
        expect(results.filter((r) => r.status === "last_admin")).toHaveLength(1);
        expect(await prisma.tenantMembership.count({ where: { tenantId: tenant.id } })).toBe(1);
    });

    it("al quitar a un miembro pierde el acceso al instante, pero su cuenta no se borra", async () => {
        const { tenantA, adminA, memberA } = await createTwoTenants();
        const admin = await login(adminA.email);
        const member = await login(memberA.email);
        expect((await api().get(`/tenants/${tenantA.id}`).set(...bearer(member.accessToken))).status).toBe(200);

        const res = await api().delete(`/tenants/${tenantA.id}/members/${memberA.id}`).set(...bearer(admin.accessToken));
        expect(res.status).toBe(204);

        expect((await api().get(`/tenants/${tenantA.id}`).set(...bearer(member.accessToken))).status).toBe(404);
        expect(await prisma.user.count({ where: { id: memberA.id } })).toBe(1);
        expect(await prisma.auditLog.count({ where: { action: "tenant.member.remove", tenantId: tenantA.id } })).toBe(1);
    });

    it("no se puede tocar a un usuario de OTRA empresa usando la ruta de la propia (404)", async () => {
        const { tenantA, tenantB, adminA, adminB } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);
        const url = `/tenants/${tenantA.id}/members/${adminB.id}`;

        const patch = await api().patch(url).set(...bearer(accessToken)).send({ role: "MEMBER" });
        const remove = await api().delete(url).set(...bearer(accessToken));
        const setup = await api().post(`${url}/setup-email`).set(...bearer(accessToken));

        expect(patch.status).toBe(404);
        expect(remove.status).toBe(404);
        expect(setup.status).toBe(404);
        expect(await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId: tenantB.id, userId: adminB.id } },
        })).toMatchObject({ role: "TENANT_ADMIN" });
    });

    it("un userId mal formado equivale a un miembro inexistente (404)", async () => {
        const { tenantA, adminA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);

        const res = await api().delete(`/tenants/${tenantA.id}/members/no-es-uuid`).set(...bearer(accessToken));
        expect(res.status).toBe(404);
    });
});

describe("reenvío del enlace", () => {
    it("reenvía solo a miembros sin contraseña; con contraseña → 400", async () => {
        const { tenantA, adminA, memberA } = await createTwoTenants();
        const { accessToken } = await login(adminA.email);
        const pending = await createUser({ email: "pendiente@example.com", withPassword: false });
        await addMember(tenantA.id, pending.id, "MEMBER");

        const ok = await api().post(`/tenants/${tenantA.id}/members/${pending.id}/setup-email`).set(...bearer(accessToken));
        const hasPassword = await api().post(`/tenants/${tenantA.id}/members/${memberA.id}/setup-email`).set(...bearer(accessToken));

        expect(ok.status).toBe(202);
        expect(hasPassword.status).toBe(400);
        expect(() => lastSetupToken()).not.toThrow();
    });
});

describe("contraseña del seed", () => {
    it("los usuarios de prueba entran con la contraseña conocida", async () => {
        const user = await createUser();
        expect((await api().post("/auth/login").send({ email: user.email, password: PASSWORD })).status).toBe(200);
    });
});
