import type {
    AuthDatasource,
    AuthRepository,
    NewUserTokenData,
    UserEntity,
    UserTokenRecord,
    UserTokenType,
} from "../../domain";


export class AuthRepositoryImpl implements AuthRepository {
    constructor(private readonly authDatasource: AuthDatasource) {}

    findByEmail(email: string): Promise<UserEntity | null> {
        return this.authDatasource.findByEmail(email);
    }

    createUserToken(data: NewUserTokenData): Promise<void> {
        return this.authDatasource.createUserToken(data);
    }

    findValidUserToken(tokenHash: string, type: UserTokenType): Promise<UserTokenRecord | null> {
        return this.authDatasource.findValidUserToken(tokenHash, type);
    }

    verifyEmail(tokenId: string, userId: string): Promise<boolean> {
        return this.authDatasource.verifyEmail(tokenId, userId);
    }

    resetPassword(
        tokenId: string,
        userId: string,
        passwordHash: string,
        termsAcceptedAt: Date | null,
    ): Promise<boolean> {
        return this.authDatasource.resetPassword(tokenId, userId, passwordHash, termsAcceptedAt);
    }
}
