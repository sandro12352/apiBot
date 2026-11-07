import { prisma } from "../../data/postgres";
import {
    AuthDatasource,
    UserEntity,
    type NewUserTokenData,
    type UserTokenRecord,
    type UserTokenType,
} from "../../domain";

export class AuthDatasourceImpl extends AuthDatasource {

    async findByEmail(email: string): Promise<UserEntity | null> {
        const user = await prisma.user.findUnique({ where: { email } });
        return user ? UserEntity.fromObject(user) : null;
    }

    async registerFailedLogin(userId: string, maxAttempts: number, lockUntil: Date): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const user = await tx.user.update({
                where: { id: userId },
                data: { failedLoginAttempts: { increment: 1 } },
                select: { failedLoginAttempts: true },
            });
            if (user.failedLoginAttempts < maxAttempts) return false;

            await tx.user.update({
                where: { id: userId },
                data: { failedLoginAttempts: 0, lockedUntil: lockUntil },
            });
            return true;
        });
    }

    async resetFailedLogins(userId: string): Promise<void> {
        await prisma.user.updateMany({
            where: { id: userId, OR: [{ failedLoginAttempts: { gt: 0 } }, { lockedUntil: { not: null } }] },
            data: { failedLoginAttempts: 0, lockedUntil: null },
        });
    }

    async createUserToken(data: NewUserTokenData): Promise<void> {
        await prisma.$transaction([
            prisma.userToken.deleteMany({
                where: { userId: data.userId, type: data.type, usedAt: null },
            }),
            prisma.userToken.create({ data }),
        ]);
    }

    async findValidUserToken(tokenHash: string, type: UserTokenType): Promise<UserTokenRecord | null> {
        const token = await prisma.userToken.findFirst({
            where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
            select: {
                id: true,
                userId: true,
                type: true,
                expiresAt: true,
                user: { select: { privacyAcceptedAt: true, termsAcceptedAt: true } },
            },
        });
        if (!token) return null;

        const { user, ...record } = token;
        return {
            ...record,
            termsAccepted: user.privacyAcceptedAt !== null && user.termsAcceptedAt !== null,
        };
    }

    async verifyEmail(tokenId: string, userId: string): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const now = new Date();
            // La condición usedAt: null hace el consumo atómico (un solo uso)
            const consumed = await tx.userToken.updateMany({
                where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
                data: { usedAt: now },
            });
            if (consumed.count === 0) return false;

            await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
            // Solo activa cuentas pendientes; nunca reactiva una cuenta suspendida
            await tx.user.updateMany({
                where: { id: userId, status: "PENDING_VERIFICATION" },
                data: { status: "ACTIVE" },
            });
            return true;
        });
    }

    async resetPassword(
        tokenId: string,
        userId: string,
        passwordHash: string,
        termsAcceptedAt: Date | null,
    ): Promise<boolean> {
        return prisma.$transaction(async (tx) => {
            const now = new Date();
            const consumed = await tx.userToken.updateMany({
                where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
                data: { usedAt: now },
            });
            if (consumed.count === 0) return false;

            // La contraseña nueva también desbloquea la cuenta
            await tx.user.update({
                where: { id: userId },
                data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
            });

            // Recibir el enlace en su correo prueba que el email es suyo
            await tx.user.updateMany({
                where: { id: userId, emailVerifiedAt: null },
                data: { emailVerifiedAt: now },
            });
            // Solo activa cuentas pendientes; nunca reactiva una cuenta suspendida
            await tx.user.updateMany({
                where: { id: userId, status: "PENDING_VERIFICATION" },
                data: { status: "ACTIVE" },
            });
            // Registra la aceptación solo si aún no existía (no sobrescribe la original)
            if (termsAcceptedAt) {
                await tx.user.updateMany({
                    where: { id: userId, privacyAcceptedAt: null },
                    data: { privacyAcceptedAt: termsAcceptedAt },
                });
                await tx.user.updateMany({
                    where: { id: userId, termsAcceptedAt: null },
                    data: { termsAcceptedAt },
                });
            }
            // Invalida cualquier otro token de recuperación pendiente del usuario
            await tx.userToken.deleteMany({
                where: { userId, type: "PASSWORD_RESET", usedAt: null },
            });
            return true;
        });
    }
}
