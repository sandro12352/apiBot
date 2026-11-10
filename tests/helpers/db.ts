import { prisma } from "../../src/data/postgres";

// Vacía todas las tablas (CASCADE alcanza las que dependen de users y tenants).
// Seguro: la BD de pruebas está garantizada por test-db.ts / vitest.config.ts.
export const resetDb = async (): Promise<void> => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "tenants" RESTART IDENTITY CASCADE');
};

export { prisma };
