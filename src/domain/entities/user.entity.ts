export type UserStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED";

// Datos para persistir un usuario nuevo. passwordHash y la aceptación de términos
// son null cuando la cuenta la crea un administrador y el cliente aún no las ha definido.
export interface NewUserData {
    email: string;
    passwordHash: string | null;
    privacyAcceptedAt: Date | null;
    termsAcceptedAt: Date | null;
}

// Datos que se pueden actualizar de un usuario (contraseña ya hasheada)
export interface UpdateUserData {
    email?: string | undefined;
    passwordHash?: string | undefined;
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
        public readonly lockedUntil: Date | null,
        public readonly privacyAcceptedAt: Date | null,
        public readonly termsAcceptedAt: Date | null,
        public readonly createdAt: Date,
        public readonly updatedAt: Date,
    ) {}

    // Versión segura para enviar al cliente (sin datos sensibles)
    public toPublic() {
        const { passwordHash, identityProviderId, lockedUntil, ...publicData } = this;
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
            lockedUntil,
            privacyAcceptedAt,
            termsAcceptedAt,
            createdAt,
            updatedAt,
        } = object;

        if (!id) throw new Error("Missing id");
        if (!email) throw new Error("Missing email");
        if (!status) throw new Error("Missing status");
        if (isPlatformAdmin === undefined) throw new Error("Missing isPlatformAdmin");
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
            lockedUntil ?? null,
            privacyAcceptedAt ?? null,
            termsAcceptedAt ?? null,
            createdAt,
            updatedAt,
        );
    }
}
