// Puerto de almacenamiento de archivos privados (imágenes del catálogo, más adelante documentos).
// Hoy: disco del servidor. Cambiar a un almacenamiento compatible con S3 (Cloudflare R2, AWS S3,
// MinIO) es escribir otro adaptador; el resto del sistema solo conoce la clave del archivo.
export abstract class FileStorage {
    abstract save(key: string, data: Buffer): Promise<void>;
    // null si el archivo no existe
    abstract read(key: string): Promise<Buffer | null>;
    // No falla si el archivo ya no existe
    abstract remove(key: string): Promise<void>;
}

// Claves generadas por el sistema: segmentos alfanuméricos con guiones, separados por "/", y una
// extensión de imagen. Rechaza "..", rutas absolutas y cualquier otro carácter.
const SAFE_KEY = /^[A-Za-z0-9-]+(?:\/[A-Za-z0-9-]+)*\.(?:jpg|png|webp)$/;

export const isSafeStorageKey = (key: string): boolean => key.length <= 300 && SAFE_KEY.test(key);
