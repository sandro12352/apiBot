import type { UserEntity } from "./user.entity";

export interface NewSessionData {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
}

export interface SessionRecord {
    id: string;
    userId: string;
    expiresAt: Date;
    revokedAt: Date | null;
    // Sesión que la sustituyó al rotar el refresh token
    replacedById: string | null;
}

export interface SessionWithUser {
    session: SessionRecord;
    user: UserEntity;
}

// Metadatos de la petición que se guardan en la sesión (sin datos sensibles)
export interface RequestMeta {
    ip: string | null;
    userAgent: string | null;
}
