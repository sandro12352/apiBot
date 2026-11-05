import type { NewUserTokenData, UserTokenRecord, UserTokenType } from "../entities/user-token.entity";
import type { UserEntity } from "../entities/user.entity";



export abstract class AuthDatasource {
    abstract findByEmail(email: string): Promise<UserEntity | null>;

    // Invalida los tokens pendientes del mismo tipo y crea el nuevo
    abstract createUserToken(data: NewUserTokenData): Promise<void>;

    // Devuelve el token solo si existe, no se usó y no ha expirado
    abstract findValidUserToken(tokenHash: string, type: UserTokenType): Promise<UserTokenRecord | null>;

    // Consume el token y marca el email como verificado. false si el token ya no era válido.
    abstract verifyEmail(tokenId: string, userId: string): Promise<boolean>;

    // Consume el token y cambia la contraseña. false si el token ya no era válido.
    abstract resetPassword(
        tokenId: string,
        userId: string,
        passwordHash: string,
        termsAcceptedAt: Date | null,
    ): Promise<boolean>;
}
