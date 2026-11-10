import { execSync } from "node:child_process";
import pg from "pg";
import { resolveTestDatabaseUrl } from "./helpers/test-db";

// Crea la BD de pruebas si no existe y le aplica las migraciones.
export default async function setup(): Promise<void> {
    const url = resolveTestDatabaseUrl();
    const dbName = decodeURIComponent(new URL(url).pathname.slice(1));

    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    const client = new pg.Client({ connectionString: adminUrl.toString() });
    await client.connect();
    try {
        const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
        if (exists.rowCount === 0) {
            // dbName ya está validado por resolveTestDatabaseUrl (solo [A-Za-z0-9_])
            await client.query(`CREATE DATABASE "${dbName}"`);
        }
    } finally {
        await client.end();
    }

    execSync("npx prisma migrate deploy --config prisma7.config.ts", {
        env: { ...process.env, DATABASE_URL: url },
        stdio: "pipe",
    });
}
