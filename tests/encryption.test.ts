import { describe, expect, it } from "vitest";
import { AesGcmAdapter } from "../src/config/adapters/aes-gcm.adapter";

const KEY = Buffer.alloc(32, 1).toString("base64");

describe("AesGcmAdapter", () => {
    it("cifra y descifra devolviendo el texto original", () => {
        const adapter = new AesGcmAdapter(KEY);
        const encrypted = adapter.encrypt("EAAB-token-secreto");

        expect(encrypted).not.toContain("EAAB-token-secreto");
        expect(adapter.decrypt(encrypted)).toBe("EAAB-token-secreto");
    });

    it("usa un IV distinto en cada cifrado", () => {
        const adapter = new AesGcmAdapter(KEY);
        expect(adapter.encrypt("mismo texto")).not.toBe(adapter.encrypt("mismo texto"));
    });

    it("rechaza un payload alterado", () => {
        const adapter = new AesGcmAdapter(KEY);
        const [iv, tag, ciphertext] = adapter.encrypt("dato").split(".") as [string, string, string];
        const tampered = Buffer.from(ciphertext, "base64");
        tampered[0] = (tampered[0] ?? 0) ^ 0xff;

        expect(() => adapter.decrypt([iv, tag, tampered.toString("base64")].join("."))).toThrow("Could not decrypt");
    });

    it("rechaza descifrar con otra clave", () => {
        const encrypted = new AesGcmAdapter(KEY).encrypt("dato");
        const other = new AesGcmAdapter(Buffer.alloc(32, 2).toString("base64"));

        expect(() => other.decrypt(encrypted)).toThrow("Could not decrypt");
    });

    it("falla con claridad si la clave falta o no mide 32 bytes", () => {
        expect(() => new AesGcmAdapter("").encrypt("x")).toThrow("ENCRYPTION_MASTER_KEY is not set");
        expect(() => new AesGcmAdapter(Buffer.alloc(16).toString("base64")).encrypt("x")).toThrow("32 bytes");
    });
});
