import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { FileStorage, isSafeStorageKey } from "../../config/adapters/file-storage";

// Archivos en el disco del servidor, bajo un directorio privado (fuera de lo que se sirve en
// público). Las claves se validan y la ruta final se comprueba para que nunca salga de la base.
export class LocalDiskStorage extends FileStorage {
    private readonly baseDir: string;

    constructor(baseDir: string) {
        super();
        this.baseDir = resolve(baseDir);
    }

    private pathOf(key: string): string {
        if (!isSafeStorageKey(key)) throw new Error("Invalid storage key");
        const path = resolve(this.baseDir, key);
        if (!path.startsWith(this.baseDir + sep)) throw new Error("Invalid storage key");
        return path;
    }

    async save(key: string, data: Buffer): Promise<void> {
        const path = this.pathOf(key);
        await mkdir(dirname(path), { recursive: true });
        // Escritura atómica: primero a un temporal y luego se renombra
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, data);
        await rename(temporary, path);
    }

    async read(key: string): Promise<Buffer | null> {
        try {
            return await readFile(this.pathOf(key));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
            throw error;
        }
    }

    async remove(key: string): Promise<void> {
        await rm(this.pathOf(key), { force: true });
    }
}
