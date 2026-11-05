import jwt, { type SignOptions } from "jsonwebtoken";
import { TokenSigner } from "../../domain";
import { envs } from "../envs";

export class JwtAdapter extends TokenSigner {

    sign(payload: object): string {
        return jwt.sign(payload, envs.JWT_SECRET, {
            expiresIn: envs.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>,
        });
    }

    // Devuelve el payload si el token es válido y no ha expirado; null en caso contrario
    verify<T = unknown>(token: string): T | null {
        try {
            return jwt.verify(token, envs.JWT_SECRET) as T;
        } catch {
            return null;
        }
    }
}
