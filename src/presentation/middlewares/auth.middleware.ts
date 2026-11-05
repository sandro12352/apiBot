import type { NextFunction, Request, Response } from "express";
import type { TokenSigner, UserRepository } from "../../domain";

export interface AuthenticatedUser {
    id: string;
    isPlatformAdmin: boolean;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export class AuthMiddleware {

    constructor(
        private readonly tokenSigner: TokenSigner,
        private readonly userRepository: UserRepository,
    ) {}

    // Exige "Authorization: Bearer <jwt>" válido y un usuario existente y no suspendido.
    // Consulta la BD en cada petición para que suspender una cuenta surta efecto de inmediato.
    public authenticate = async (req: Request, res: Response, next: NextFunction) => {
        const header = req.header('authorization');
        if (!header?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
        }

        const payload = this.tokenSigner.verify<{ id?: unknown }>(header.slice('Bearer '.length));
        if (!payload || typeof payload.id !== 'string') {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        try {
            const user = await this.userRepository.findById(payload.id);
            if (!user) return res.status(401).json({ error: 'Invalid or expired token' });
            if (user.status === 'SUSPENDED') return res.status(403).json({ error: 'User is suspended' });

            req.user = { id: user.id, isPlatformAdmin: user.isPlatformAdmin };
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
