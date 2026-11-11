import "dotenv/config";
import { defineConfig } from "vitest/config";
import { resolveTestDatabaseUrl } from "./tests/helpers/test-db.ts";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        globalSetup: ["./tests/global-setup.ts"],
        // Todos los archivos comparten la misma BD de pruebas
        fileParallelism: false,
        testTimeout: 20_000,
        hookTimeout: 60_000,
        // Estas variables se fijan ANTES de importar la app; dotenv no sobrescribe las ya definidas
        env: {
            DATABASE_URL: resolveTestDatabaseUrl(),
            JWT_SECRET: "test-secret-not-for-production-0123456789abcdef",
            // Sin SMTP: los correos se imprimen en consola, nunca se envían (aunque .env tenga Gmail)
            SMTP_HOST: "",
            SMTP_USER: "",
            SMTP_PASS: "",
            // Los límites por IP chocarían con la cantidad de logins que hacen los tests
            RATE_LIMIT_MAX: "1000000",
            AUTH_RATE_LIMIT_MAX: "1000000",
            LOGIN_MAX_ATTEMPTS: "3",
            LOGIN_LOCK_MINUTES: "15",
            ALLOW_PUBLIC_REGISTER: "false",
            // Meta: valores de prueba; nunca se llama a Meta (el envío se simula en los tests)
            META_APP_SECRET: "test-app-secret",
            META_WEBHOOK_VERIFY_TOKEN: "test-verify-token",
            ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
        },
    },
});
