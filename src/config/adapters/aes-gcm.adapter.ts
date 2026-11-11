import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Encryptor } from "../../domain";
import { envs } from "../envs";

const IV_BYTES = 12;
const KEY_BYTES = 32;

// AES-256-GCM. Formato guardado: base64(iv).base64(tag).base64(ciphertext)
export class AesGcmAdapter extends Encryptor {
    private cachedKey?: Buffer;

    constructor(private readonly masterKeyBase64: string | undefined = envs.ENCRYPTION_MASTER_KEY) {
        super();
    }

    // La clave se valida al usarla, no al construir: así el servidor arranca sin Meta configurado
    private get key(): Buffer {
        if (this.cachedKey) return this.cachedKey;
        if (!this.masterKeyBase64) throw new Error("ENCRYPTION_MASTER_KEY is not set");
        const key = Buffer.from(this.masterKeyBase64, "base64");
        if (key.length !== KEY_BYTES) throw new Error("ENCRYPTION_MASTER_KEY must be 32 bytes in base64");
        return (this.cachedKey = key);
    }

    encrypt(plain: string): string {
        const iv = randomBytes(IV_BYTES);
        const cipher = createCipheriv("aes-256-gcm", this.key, iv);
        const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        return [iv, tag, ciphertext].map((part) => part.toString("base64")).join(".");
    }

    decrypt(payload: string): string {
        const parts = payload.split(".");
        if (parts.length !== 3) throw new Error("Invalid encrypted payload");
        const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64")) as [Buffer, Buffer, Buffer];
        try {
            const decipher = createDecipheriv("aes-256-gcm", this.key, iv, { authTagLength: 16 });
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
        } catch {
            // No filtrar detalles del error interno de OpenSSL
            throw new Error("Could not decrypt payload");
        }
    }
}
