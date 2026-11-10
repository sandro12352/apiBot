import { beforeEach, describe, expect, it } from "vitest";
import { api, bearer, login } from "./helpers/api";
import { prisma, resetDb } from "./helpers/db";
import { createResetToken, createUser, PASSWORD } from "./helpers/seed";

// Sesiones con refresh rotativo, revocación inmediata y bloqueo por fuerza bruta.

describe("sesión", () => {
    beforeEach(resetDb);

    it("logout: el access token deja de servir al instante", async () => {
        const user = await createUser();
        const { accessToken } = await login(user.email);

        expect((await api().get("/auth/me").set(...bearer(accessToken))).status).toBe(200);
        expect((await api().post("/auth/logout").set(...bearer(accessToken))).status).toBe(204);
        expect((await api().get("/auth/me").set(...bearer(accessToken))).status).toBe(401);
    });

    it("logout solo cierra la sesión actual; logout-all cierra todas", async () => {
        const user = await createUser();
        const first = await login(user.email);
        const second = await login(user.email);

        await api().post("/auth/logout").set(...bearer(first.accessToken));
        expect((await api().get("/auth/me").set(...bearer(second.accessToken))).status).toBe(200);

        const third = await login(user.email);
        expect((await api().post("/auth/logout-all").set(...bearer(second.accessToken))).status).toBe(204);
        expect((await api().get("/auth/me").set(...bearer(second.accessToken))).status).toBe(401);
        expect((await api().get("/auth/me").set(...bearer(third.accessToken))).status).toBe(401);
    });

    it("refresh rota la sesión: el access token anterior deja de servir y el nuevo sí", async () => {
        const user = await createUser();
        const first = await login(user.email);

        const res = await api().post("/auth/refresh").send({ refreshToken: first.refreshToken });
        expect(res.status).toBe(200);
        expect(res.body.refreshToken).not.toBe(first.refreshToken);

        expect((await api().get("/auth/me").set(...bearer(first.accessToken))).status).toBe(401);
        expect((await api().get("/auth/me").set(...bearer(res.body.accessToken))).status).toBe(200);
    });

    it("reutilizar un refresh ya rotado se trata como robo: revoca TODAS las sesiones", async () => {
        const user = await createUser();
        const first = await login(user.email);
        const rotated = (await api().post("/auth/refresh").send({ refreshToken: first.refreshToken })).body;

        const reuse = await api().post("/auth/refresh").send({ refreshToken: first.refreshToken });
        expect(reuse.status).toBe(401);

        // ni el refresh legítimo ni su access token sobreviven
        expect((await api().get("/auth/me").set(...bearer(rotated.accessToken))).status).toBe(401);
        expect((await api().post("/auth/refresh").send({ refreshToken: rotated.refreshToken })).status).toBe(401);

        const audit = await prisma.auditLog.findFirst({ where: { action: "auth.refresh_reuse", actorUserId: user.id } });
        expect(audit?.result).toBe("FAILURE");
    });

    it("refresh con un token inventado o mal formado no entra", async () => {
        const fake = await api().post("/auth/refresh").send({ refreshToken: "a".repeat(64) });
        const malformed = await api().post("/auth/refresh").send({ refreshToken: "corto" });

        expect(fake.status).toBe(401);
        expect(malformed.status).toBe(400);
    });

    it("una sesión caducada no se puede renovar", async () => {
        const user = await createUser();
        const { refreshToken } = await login(user.email);
        await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

        expect((await api().post("/auth/refresh").send({ refreshToken })).status).toBe(401);
    });

    it("un usuario suspendido pierde el acceso con el token que ya tenía", async () => {
        const user = await createUser();
        const { accessToken } = await login(user.email);
        await prisma.user.update({ where: { id: user.id }, data: { status: "SUSPENDED" } });

        expect((await api().get("/auth/me").set(...bearer(accessToken))).status).toBe(403);
    });

    it("el reset de contraseña cierra todas las sesiones abiertas", async () => {
        const user = await createUser();
        const { accessToken } = await login(user.email);
        const token = await createResetToken(user.id);

        const reset = await api().post("/auth/reset-password").send({ token, password: "OtraClave456!" });
        expect(reset.status).toBe(200);

        expect((await api().get("/auth/me").set(...bearer(accessToken))).status).toBe(401);
        expect((await api().post("/auth/login").send({ email: user.email, password: PASSWORD })).status).toBe(401);
        expect((await api().post("/auth/login").send({ email: user.email, password: "OtraClave456!" })).status).toBe(200);
    });

    it("un token de reset es de un solo uso", async () => {
        const user = await createUser();
        const token = await createResetToken(user.id);

        expect((await api().post("/auth/reset-password").send({ token, password: "OtraClave456!" })).status).toBe(200);
        expect((await api().post("/auth/reset-password").send({ token, password: "Tercera789!" })).status).toBe(400);
    });
});

describe("bloqueo por fuerza bruta (LOGIN_MAX_ATTEMPTS=3 en tests)", () => {
    beforeEach(resetDb);

    it("tras los intentos fallidos la cuenta se bloquea, incluso con la contraseña correcta", async () => {
        const user = await createUser();
        const wrong = () => api().post("/auth/login").send({ email: user.email, password: "incorrecta" });

        expect((await wrong()).status).toBe(401);
        expect((await wrong()).status).toBe(401);
        expect((await wrong()).status).toBe(429); // el tercer fallo bloquea

        const correct = await api().post("/auth/login").send({ email: user.email, password: PASSWORD });
        expect(correct.status).toBe(429);

        const audit = await prisma.auditLog.findFirst({ where: { action: "auth.lockout", actorUserId: user.id } });
        expect(audit).not.toBeNull();
    });

    it("al expirar el bloqueo se puede volver a entrar y el contador se reinicia", async () => {
        const user = await createUser();
        for (let i = 0; i < 3; i++) {
            await api().post("/auth/login").send({ email: user.email, password: "incorrecta" });
        }
        await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });

        expect((await api().post("/auth/login").send({ email: user.email, password: PASSWORD })).status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginAttempts).toBe(0);
    });

    it("un email inexistente y una contraseña incorrecta dan la misma respuesta (401)", async () => {
        const user = await createUser();

        const unknown = await api().post("/auth/login").send({ email: "nadie@example.com", password: PASSWORD });
        const wrong = await api().post("/auth/login").send({ email: user.email, password: "incorrecta" });

        expect(unknown.status).toBe(401);
        expect(wrong.status).toBe(401);
        expect(unknown.body).toEqual(wrong.body);
    });

    it("una cuenta sin contraseña (creada por un administrador) no puede iniciar sesión", async () => {
        const user = await createUser({ withPassword: false });

        const res = await api().post("/auth/login").send({ email: user.email, password: PASSWORD });
        expect(res.status).toBe(401);
    });
});
