import { prisma } from "../../data/postgres";
import {
    SessionDatasource,
    UserEntity,
    type NewSessionData,
    type SessionRecord,
    type SessionWithUser,
} from "../../domain";

const sessionSelect = {
    id: true,
    userId: true,
    expiresAt: true,
    revokedAt: true,
    replacedById: true,
} as const;

export class SessionDatasourceImpl extends SessionDatasource {

    async create(data: NewSessionData): Promise<SessionRecord> {
        return prisma.session.create({ data, select: sessionSelect });
    }

    async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionWithUser | null> {
        const row = await prisma.session.findUnique({
            where: { refreshTokenHash },
            select: { ...sessionSelect, user: true },
        });
        if (!row) return null;
        const { user, ...session } = row;
        return { session, user: UserEntity.fromObject(user) };
    }

    async findActiveWithUser(sessionId: string): Promise<SessionWithUser | null> {
        const row = await prisma.session.findFirst({
            where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
            select: { ...sessionSelect, user: true },
        });
        if (!row) return null;
        const { user, ...session } = row;
        return { session, user: UserEntity.fromObject(user) };
    }

    async rotate(sessionId: string, next: NewSessionData): Promise<SessionRecord | null> {
        return prisma.$transaction(async (tx) => {
            const now = new Date();
            // La condición revokedAt: null hace la rotación atómica (un solo uso del refresh)
            const revoked = await tx.session.updateMany({
                where: { id: sessionId, revokedAt: null, expiresAt: { gt: now } },
                data: { revokedAt: now, lastUsedAt: now },
            });
            if (revoked.count === 0) return null;

            const created = await tx.session.create({ data: next, select: sessionSelect });
            await tx.session.update({ where: { id: sessionId }, data: { replacedById: created.id } });
            return created;
        });
    }

    async revoke(sessionId: string): Promise<void> {
        await prisma.session.updateMany({
            where: { id: sessionId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }

    async revokeAllForUser(userId: string): Promise<void> {
        await prisma.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
}
