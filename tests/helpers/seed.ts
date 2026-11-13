import { createHash, randomBytes, randomUUID } from "node:crypto";
import { AesGcmAdapter } from "../../src/config/adapters/aes-gcm.adapter";
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

export const WA_PHONE_NUMBER_ID = "100200300400500";
export const WA_ACCESS_TOKEN = "EAAB-test-access-token";

interface ConnectionOptions {
    botMode?: "TEST" | "LIVE";
    tenantBotEnabled?: boolean;
    connectionBotEnabled?: boolean;
    status?: "PENDING" | "CONNECTED" | "DISCONNECTED";
    phoneNumberId?: string;
}

// Empresa con una conexión de WhatsApp lista para responder (modo en vivo por defecto)
export const createWhatsappConnection = async (options: ConnectionOptions = {}) => {
    const tenant = await createTenant("Empresa WA");
    await prisma.tenant.update({
        where: { id: tenant.id },
        data: { botMode: options.botMode ?? "LIVE", botEnabled: options.tenantBotEnabled ?? true },
    });
    const connection = await prisma.whatsappConnection.create({
        data: {
            tenantId: tenant.id,
            wabaId: "waba-test",
            phoneNumberId: options.phoneNumberId ?? WA_PHONE_NUMBER_ID,
            status: options.status ?? "CONNECTED",
            botEnabled: options.connectionBotEnabled ?? true,
            encryptedAccessToken: new AesGcmAdapter().encrypt(WA_ACCESS_TOKEN),
        },
    });
    return { tenant, connection };
};

export const AI_API_KEY = "AIzaSy-clave-de-prueba-0123456789";

interface AiSetupOptions {
    credentialStatus?: "PENDING" | "VALID" | "INVALID" | "QUOTA_EXCEEDED";
    withCredential?: boolean;
    withAssistant?: boolean;
    assistantModel?: string | null;
    preferredModel?: string | null;
}

// Asistente + clave de IA (cifrada) ya configurados para una empresa
export const createAiSetup = async (tenantId: string, options: AiSetupOptions = {}) => {
    if (options.withCredential ?? true) {
        await prisma.aiProviderCredential.create({
            data: {
                tenantId,
                provider: "GEMINI",
                encryptedApiKey: new AesGcmAdapter().encrypt(AI_API_KEY),
                maskedKey: "AIza…6789",
                status: options.credentialStatus ?? "VALID",
                preferredModel: options.preferredModel === undefined ? "gemini-test-model" : options.preferredModel,
            },
        });
    }
    if (options.withAssistant ?? true) {
        await prisma.assistant.create({
            data: {
                tenantId,
                name: "Asistente",
                instructions: "Vendemos zapatillas deportivas. Horario de lunes a viernes.",
                language: "es",
                tone: "amable",
                businessRules: "No ofrezcas descuentos.",
                aiModel: options.assistantModel ?? null,
            },
        });
    }
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
