export abstract class TokenSigner {
    abstract sign(payload: object): string;

    abstract verify<T = unknown>(token: string): T | null;
}
