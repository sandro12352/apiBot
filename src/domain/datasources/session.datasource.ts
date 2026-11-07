import type { NewSessionData, SessionRecord, SessionWithUser } from "../entities/session.entity";


export abstract class SessionDatasource {
    abstract create(data: NewSessionData): Promise<SessionRecord>;

    // Sesión por hash del refresh token, sea cual sea su estado (para detectar reutilización)
    abstract findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionWithUser | null>;

    // Sesión con su usuario solo si no está revocada ni caducada
    abstract findActiveWithUser(sessionId: string): Promise<SessionWithUser | null>;

    // Revoca la sesión y crea la nueva de forma atómica. null si la sesión ya no estaba activa.
    abstract rotate(sessionId: string, next: NewSessionData): Promise<SessionRecord | null>;

    abstract revoke(sessionId: string): Promise<void>;

    abstract revokeAllForUser(userId: string): Promise<void>;
}
