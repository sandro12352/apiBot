// Cifrado simétrico de secretos en reposo (tokens de Meta, API keys, contexto)
export abstract class Encryptor {
    abstract encrypt(plain: string): string;
    abstract decrypt(payload: string): string;
}
