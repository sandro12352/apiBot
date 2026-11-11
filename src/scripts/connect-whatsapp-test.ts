import { AesGcmAdapter } from "../config/adapters/aes-gcm.adapter";
import { prisma } from "../data/postgres";
import { MemberDatasourceImpl } from "../infrastructure/datasource/member.datasource.impl";
import { buildAuthService } from "../presentation/auth/auth.factory";

// Uso: npm run whatsapp:connect -- <phoneNumberId> <wabaId> <tuNumero> [correoAdmin]
// Solo para desarrollo con el número de prueba de Meta. Crea (o actualiza) una empresa
// de prueba y su conexión de WhatsApp. Con [correoAdmin] deja además a ese usuario como
// TENANT_ADMIN de la empresa (si no existe, lo crea y le envía el enlace para su contraseña). El token se pide por terminal, oculto: nunca
// va por argumento ni se guarda en claro. Repetir el comando renueva el token (dura 24 h).

const SLUG = "empresa-prueba-whatsapp";

const readSecret = (prompt: string): Promise<string> =>
    new Promise((resolve, reject) => {
        const stdin = process.stdin;
        if (!stdin.isTTY) return reject(new Error("Ejecútalo en una terminal interactiva."));
        process.stdout.write(prompt);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");
        let value = "";
        const onData = (chunk: string) => {
            for (const char of chunk) {
                if (char === "\u0003") {
                    stdin.setRawMode(false);
                    return reject(new Error("Cancelado."));
                }
                if (char === "\r" || char === "\n") {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.removeListener("data", onData);
                    process.stdout.write("\n");
                    return resolve(value.trim());
                }
                if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
                else value += char;
            }
        };
        stdin.on("data", onData);
    });

const main = async () => {
    const [phoneNumberId, wabaId, myNumber, adminArg] = process.argv.slice(2);
    const adminEmail = adminArg?.trim().toLowerCase();
    if (adminEmail && !adminEmail.includes("@")) throw new Error("El correo del administrador no es válido.");
    const digits = myNumber?.replace(/\D/g, "");
    if (!phoneNumberId || !wabaId || !digits) {
        console.error("Uso: npm run whatsapp:connect -- <phoneNumberId> <wabaId> <tuNumero> [correoAdmin]");
        process.exit(1);
    }

    const token = await readSecret("Pega el token temporal de Meta (no se mostrará): ");
    if (!token) throw new Error("Token vacío.");

    const encryptedAccessToken = new AesGcmAdapter().encrypt(token);

    const tenant = await prisma.tenant.upsert({
        where: { slug: SLUG },
        update: { botEnabled: true, botMode: "TEST", status: "ACTIVE" },
        create: { name: "Empresa de prueba WhatsApp", slug: SLUG, botEnabled: true, botMode: "TEST" },
    });

    const connection = await prisma.whatsappConnection.upsert({
        where: { phoneNumberId },
        update: {
            tenantId: tenant.id,
            wabaId,
            encryptedAccessToken,
            status: "CONNECTED",
            botEnabled: true,
            connectedAt: new Date(),
            tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        create: {
            tenantId: tenant.id,
            wabaId,
            phoneNumberId,
            encryptedAccessToken,
            status: "CONNECTED",
            botEnabled: true,
            connectedAt: new Date(),
            tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
    });

    await prisma.testNumber.upsert({
        where: { tenantId_phoneNumber: { tenantId: tenant.id, phoneNumber: digits } },
        update: { connectionId: connection.id },
        create: { tenantId: tenant.id, connectionId: connection.id, phoneNumber: digits, label: "Mi número" },
    });

    if (adminEmail) {
        const user = await prisma.user.findUnique({ where: { email: adminEmail } });
        if (user) {
            await prisma.tenantMembership.upsert({
                where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
                update: { role: "TENANT_ADMIN" },
                create: { tenantId: tenant.id, userId: user.id, role: "TENANT_ADMIN" },
            });
            console.log(`${adminEmail} ya existía: ahora es administrador de la empresa de prueba.`);
        } else {
            const { user: created } = await new MemberDatasourceImpl().createMember(tenant.id, adminEmail, "TENANT_ADMIN");
            await buildAuthService().sendAccountSetupEmail(created);
            console.log(`Administrador creado: ${adminEmail}. Enlace de contraseña enviado (o impreso aquí si no hay SMTP).`);
        }
    }

    console.log(`Listo. Empresa: ${tenant.name} (${tenant.id})`);
    console.log(`Conexión: phone_number_id ${phoneNumberId}, estado CONNECTED, modo TEST, número autorizado ${digits}.`);
    console.log("El token se guardó cifrado. Caduca en 24 h: vuelve a ejecutar el comando para renovarlo.");
};

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit();
    });
