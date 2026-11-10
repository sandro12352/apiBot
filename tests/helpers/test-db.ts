// Resuelve la URL de la BD de pruebas y se niega a usar cualquier BD que no termine en
// "_test": los tests hacen TRUNCATE de las tablas y jamás deben tocar la BD de desarrollo.

export const resolveTestDatabaseUrl = (): string => {
    const explicit = process.env.TEST_DATABASE_URL;
    const base = explicit ?? process.env.DATABASE_URL;
    if (!base) {
        throw new Error("Define DATABASE_URL (o TEST_DATABASE_URL) para ejecutar los tests.");
    }

    const url = new URL(base);
    // Sin TEST_DATABASE_URL se deriva la BD de pruebas añadiendo "_test" al nombre
    if (!explicit && !url.pathname.endsWith("_test")) {
        url.pathname = `${url.pathname}_test`;
    }

    const dbName = decodeURIComponent(url.pathname.slice(1));
    if (!dbName.endsWith("_test") || !/^[A-Za-z0-9_]+$/.test(dbName)) {
        throw new Error(
            `Los tests solo se ejecutan contra una BD cuyo nombre termine en "_test" (recibido: "${dbName}").`,
        );
    }
    return url.toString();
};
