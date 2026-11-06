import { prisma } from "../data/postgres";
import { UserEntity } from "../domain";
import { buildAuthService } from "../presentation/auth/auth.factory";

// Uso: npm run admin:create -- correo@dominio.com
// Crea (o promueve) un administrador de plataforma y le envía el enlace para
// definir su contraseña. No recibe contraseñas por argumento.
const main = async () => {
    const email = process.argv[2]?.trim().toLowerCase();
    if (!email || !email.includes("@")) {
        console.error("Uso: npm run admin:create -- correo@dominio.com");
        process.exit(1);
    }

    const row = await prisma.user.upsert({
        where: { email },
        update: { isPlatformAdmin: true },
        create: { email, isPlatformAdmin: true },
    });

    if (row.passwordHash) {
        console.log(`${email} ya tenía contraseña y ahora es administrador de plataforma.`);
        return;
    }

    // Espera al envío real; si falla lanza error y se muestra abajo
    await buildAuthService().sendAccountSetupEmail(UserEntity.fromObject(row));
    console.log(`Administrador de plataforma listo: ${email}. Enlace de contraseña enviado por correo.`);
};

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        process.exit();
    });
