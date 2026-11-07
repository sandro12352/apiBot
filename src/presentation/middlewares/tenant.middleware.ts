import type { NextFunction, Request, Response } from "express";
import type { MembershipRole, TenantService } from "../../domain";

export interface TenantContext {
    id: string;
    role: MembershipRole;
}

declare global {
    namespace Express {
        interface Request {
            tenant?: TenantContext;
        }
    }
}

const NOT_FOUND = { error: 'Tenant not found' };

// Autorización por tenant y rol para las rutas /tenants/:tenantId/...
// Debe ir después de authenticate. El administrador de plataforma NO tiene acceso
// automático: gestiona las empresas desde /admin.
export class TenantMiddleware {

    constructor(
        private readonly tenantService: TenantService,
    ) {}

    // Sin roles = cualquier miembro del tenant
    public requireMember = (...roles: MembershipRole[]) =>
        async (req: Request, res: Response, next: NextFunction) => {
            if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

            const { tenantId } = req.params;
            // 404 en vez de 403: no revela si la empresa existe
            if (typeof tenantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
                return res.status(404).json(NOT_FOUND);
            }

            try {
                const membership = await this.tenantService.getMembership(tenantId, req.user.id);
                if (!membership) return res.status(404).json(NOT_FOUND);
                if (membership.tenantStatus !== 'ACTIVE') {
                    return res.status(403).json({ error: 'Tenant is not active' });
                }
                if (roles.length > 0 && !roles.includes(membership.role)) {
                    return res.status(403).json({ error: 'Forbidden' });
                }

                req.tenant = { id: membership.tenantId, role: membership.role };
                return next();
            } catch (error) {
                console.error('[TenantMiddleware.requireMember]', error);
                return res.status(500).json({ error: 'Internal server error' });
            }
        };
}
