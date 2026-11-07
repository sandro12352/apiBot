import type { NewSessionData, SessionRecord, SessionWithUser } from "../entities/session.entity";


export abstract class SessionRepository {
    abstract create(data: NewSessionData): Promise<SessionRecord>;

    abstract findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionWithUser | null>;

    abstract findActiveWithUser(sessionId: string): Promise<SessionWithUser | null>;

    abstract rotate(sessionId: string, next: NewSessionData): Promise<SessionRecord | null>;

    abstract revoke(sessionId: string): Promise<void>;

    abstract revokeAllForUser(userId: string): Promise<void>;
}
