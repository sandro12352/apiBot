import type { NewUserTokenData, UserTokenRecord, UserTokenType } from "../entities/user-token.entity";
import type { UserEntity } from "../entities/user.entity";



export abstract class AuthRepository {
    abstract findByEmail(email: string): Promise<UserEntity | null>;

    abstract createUserToken(data: NewUserTokenData): Promise<void>;

    abstract findValidUserToken(tokenHash: string, type: UserTokenType): Promise<UserTokenRecord | null>;

    abstract verifyEmail(tokenId: string, userId: string): Promise<boolean>;

    abstract resetPassword(
        tokenId: string,
        userId: string,
        passwordHash: string,
        termsAcceptedAt: Date | null,
    ): Promise<boolean>;
}
