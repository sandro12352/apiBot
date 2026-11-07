import type {
    NewSessionData,
    SessionDatasource,
    SessionRecord,
    SessionRepository,
    SessionWithUser,
} from "../../domain";


export class SessionRepositoryImpl implements SessionRepository {
    constructor(private readonly sessionDatasource: SessionDatasource) {}

    create(data: NewSessionData): Promise<SessionRecord> {
        return this.sessionDatasource.create(data);
    }

    findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionWithUser | null> {
        return this.sessionDatasource.findByRefreshTokenHash(refreshTokenHash);
    }

    findActiveWithUser(sessionId: string): Promise<SessionWithUser | null> {
        return this.sessionDatasource.findActiveWithUser(sessionId);
    }

    rotate(sessionId: string, next: NewSessionData): Promise<SessionRecord | null> {
        return this.sessionDatasource.rotate(sessionId, next);
    }

    revoke(sessionId: string): Promise<void> {
        return this.sessionDatasource.revoke(sessionId);
    }

    revokeAllForUser(userId: string): Promise<void> {
        return this.sessionDatasource.revokeAllForUser(userId);
    }
}
