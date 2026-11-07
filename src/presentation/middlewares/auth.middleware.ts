import type { NextFunction, Request, Response } from "express";
import type { RequestMeta, SessionRepository, TokenSigner } from "../../domain";

export interface AuthenticatedUser {
    id: string;
    sessionId: string;
    isPlatformAdmin: boolean;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

// IP y user-agent de la petición (se guardan en la sesión y en la auditoría)
export const requestMeta = (req: Request): RequestMeta => ({
    ip: req.ip ?? null,
    userAgent: req.header('user-agent')?.slice(0, 255) ?? null,
});

export class AuthMiddleware {

    constructor(
        private readonly tokenSigner: TokenSigner,
        private readonly sessionRepository: SessionRepository,
    ) {}

    // Exige "Authorization: Bearer <jwt>" válido, con una sesión activa (no revocada ni
    // caducada) y un usuario no suspendido. Consulta la BD en cada petición para que el
    // logout y la suspensión surtan efecto de inmediato.
    public authenticate = async (req: Request, res: Response, next: NextFunction) => {
        const header = req.header('authorization');
        if (!header?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const payload = this.tokenSigner.verify<{ id?: unknown; sid?: unknown }>(header.slice('Bearer '.length));
        if (!payload || typeof payload.id !== 'string' || typeof payload.sid !== 'string') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        try {
            const found = await this.sessionRepository.findActiveWithUser(payload.sid);
            if (!found || found.user.id !== payload.id) {
                return res.status(401).json({ error: 'Invalid or expired token' });
            }
            if (found.user.status === 'SUSPENDED') return res.status(403).json({ error: 'User is suspended' });

            req.user = { id: found.user.id, sessionId: found.session.id, isPlatformAdmin: found.user.isPlatformAdmin };
            return next();
        } catch (error) {
            console.error('[AuthMiddleware.authenticate]', error);
            return res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Debe ir después de authenticate
    public requirePlatformAdmin = (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        if (!req.user.isPlatformAdmin) return res.status(403).json({ error: 'Forbidden' });
        return next();
    }
}
