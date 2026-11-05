export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";

// Datos necesarios para persistir un usuario nuevo (contraseña ya hasheada)
export interface NewUserData {
    email: string;
    passwordHash: string;
    privacyAcceptedAt: Date;
    termsAcceptedAt: Date;
}

export class UserEntity {
    constructor(
        public readonly id: string,
        public readonly email: string,
        public readonly passwordHash: string | null,
        public readonly identityProvider: string | null,
        public readonly identityProviderId: string | null,
        public readonly status: UserStatus,
        public readonly isPlatformAdmin: boolean,
        public readonly emailVerifiedAt: Date | null,
        public readonly privacyAcceptedAt: Date,
        public readonly termsAcceptedAt: Date,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) {}

    // Versión segura para enviar al cliente (sin datos sensibles)
    public toPublic() {
        const { passwordHash, identityProviderId, ...publicData } = this;
        return publicData;
    }


    public static fromObject(object: { [key: string]: any }): UserEntity {
        const {
            id,
            email,
            passwordHash,
            identityProvider,
            identityProviderId,
            status,
            isPlatformAdmin,
            emailVerifiedAt,
            privacyAcceptedAt,
            termsAcceptedAt,
            createdAt,
            updatedAt,
        } = object;

        if (!id) throw new Error("Missing id");
        if (!email) throw new Error("Missing email");
        if (!status) throw new Error("Missing status");
        if (isPlatformAdmin === undefined) throw new Error("Missing isPlatformAdmin");
        if (!privacyAcceptedAt) throw new Error("Missing privacyAcceptedAt");
        if (!termsAcceptedAt) throw new Error("Missing termsAcceptedAt");
        if (!createdAt) throw new Error("Missing createdAt");
        if (!updatedAt) throw new Error("Missing updatedAt");

        return new UserEntity(
            id,
            email,
            passwordHash ?? null,
            identityProvider ?? null,
            identityProviderId ?? null,
            status,
            isPlatformAdmin,
            emailVerifiedAt ?? null,
            privacyAcceptedAt,
            termsAcceptedAt,
            createdAt,
            updatedAt,
        );
    }
}
