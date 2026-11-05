export type UserTokenType = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export interface NewUserTokenData {
    userId: string;
    type: UserTokenType;
    tokenHash: string;
    expiresAt: Date;
}

export interface UserTokenRecord {
    id: string;
    userId: string;
    type: UserTokenType;
    expiresAt: Date;
    // true si el usuario ya aceptó la política de privacidad y los términos
    termsAccepted: boolean;
}
