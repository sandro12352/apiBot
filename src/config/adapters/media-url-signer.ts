import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Enlaces temporales y firmados a archivos privados: /media/<clave>?exp=<unix>&sig=<hmac>.
// Así WhatsApp (que descarga la imagen desde una URL) y el panel pueden verla durante unos
// minutos, sin que el almacenamiento sea público ni se pueda listar.
export class MediaUrlSigner {
    private readonly key: Buffer;
    private readonly baseUrl: string | undefined;

    constructor(secret: string, baseUrl: string | undefined) {
        // Clave propia para este uso, derivada del secreto (no se reutiliza tal cual)
        this.key = createHash("sha256").update(`media-url:${secret}`).digest();
        this.baseUrl = baseUrl?.replace(/\/+$/, "") || undefined;
    }

    // Sin URL pública configurada no se pueden generar enlaces para WhatsApp
    get isEnabled(): boolean {
        return this.baseUrl !== undefined;
    }

    private signature(storageKey: string, expiresAt: number): string {
        return createHmac("sha256", this.key).update(`${storageKey}|${expiresAt}`).digest("base64url");
    }

    // null si no hay URL pública configurada
    sign(storageKey: string, ttlSeconds: number, now: number = Date.now()): string | null {
        if (!this.baseUrl) return null;
        const expiresAt = Math.floor(now / 1000) + ttlSeconds;
        return `${this.baseUrl}/media/${storageKey}?exp=${expiresAt}&sig=${this.signature(storageKey, expiresAt)}`;
    }

    verify(storageKey: string, exp: unknown, sig: unknown, now: number = Date.now()): boolean {
        if (typeof exp !== "string" || typeof sig !== "string" || !/^\d{1,12}$/.test(exp)) return false;
        const expiresAt = Number(exp);
        if (expiresAt < Math.floor(now / 1000)) return false;

        const expected = Buffer.from(this.signature(storageKey, expiresAt));
        const received = Buffer.from(sig);
        return expected.length === received.length && timingSafeEqual(expected, received);
    }
}
