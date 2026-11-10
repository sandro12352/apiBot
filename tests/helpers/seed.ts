import { createHash, randomBytes, randomUUID } from "node:crypto";
import { BcryptAdapter } from "../../src/config/adapters/bcrypt.adapter";
import { prisma } from "./db";

export const PASSWORD = "Password123!";

let passwordHash: string | undefined;
// bcrypt es lento a propósito: se calcula una sola vez y se reutiliza
const hashedPassword = async (): Promise<string> =>
    (passwordHash ??= await new BcryptAdapter().hash(PASSWORD));

interface UserOptions {
    email?: string;
    isPlatformAdmin?: boolean;
    status?: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";
    // false = cuenta sin contraseña (creada por un administrador)
    withPassword?: boolean;
}

export const createUser = async (options: UserOptions = {}) => {
    const withPassword = options.withPassword ?? true;
    const now = new Date();
    return prisma.user.create({
        data: {
            email: options.email ?? `user-${randomUUID()}@example.com`,
            passwordHash: withPassword ? await hashedPassword() : null,
            status: options.status ?? "ACTIVE",
            isPlatformAdmin: options.isPlatformAdmin ?? false,
            emailVerifiedAt: now,
            privacyAcceptedAt: now,
            termsAcceptedAt: now,
        },
    });
};

export const createTenant = async (name = "Empresa", status: "ACTIVE" | "SUSPENDED" | "CANCELLED" = "ACTIVE") =>
    prisma.tenant.create({
        data: { name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${randomBytes(3).toString("hex")}`, status },
    });

export const addMember = async (tenantId: string, userId: string, role: "TENANT_ADMIN" | "MEMBER") =>
    prisma.tenantMembership.create({ data: { tenantId, userId, role } });

// Crea un token de recuperación válido y devuelve el valor en claro (en BD solo va el hash)
export const createResetToken = async (userId: string): Promise<string> => {
    const token = randomBytes(32).toString("hex");
    await prisma.userToken.create({
        data: {
            userId,
            type: "PASSWORD_RESET",
            tokenHash: createHash("sha256").update(token).digest("hex"),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
    });
    return token;
};

// Escenario habitual: dos empresas aisladas, cada una con su administrador
export const createTwoTenants = async () => {
    const tenantA = await createTenant("Empresa A");
    const tenantB = await createTenant("Empresa B");
    const adminA = await createUser({ email: "admin-a@example.com" });
    const memberA = await createUser({ email: "member-a@example.com" });
    const adminB = await createUser({ email: "admin-b@example.com" });
    await addMember(tenantA.id, adminA.id, "TENANT_ADMIN");
    await addMember(tenantA.id, memberA.id, "MEMBER");
    await addMember(tenantB.id, adminB.id, "TENANT_ADMIN");
    return { tenantA, tenantB, adminA, memberA, adminB };
};
