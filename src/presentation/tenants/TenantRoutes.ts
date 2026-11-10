import { Router } from "express";
import { TenantController } from "./TenantController";
import { MemberRoutes } from "./MemberRoutes";
import { buildAuthMiddleware, buildTenantMiddleware, buildTenantService } from "../auth/auth.factory";


// Convención para los módulos de empresa: /tenants/:tenantId/<recurso>.
// Cada ruta pasa por requireMember(...roles), que valida membresía, rol y estado del tenant.
export class TenantRoutes {

    static get routes(): Router {
        const router = Router();
        const tenantController = new TenantController(buildTenantService());
        const authMiddleware = buildAuthMiddleware();
        const tenantMiddleware = buildTenantMiddleware();

        router.use(authMiddleware.authenticate);

        router.get('/:tenantId', tenantMiddleware.requireMember(), tenantController.getTenant);
        router.patch('/:tenantId', tenantMiddleware.requireMember('TENANT_ADMIN'), tenantController.updateTenant);

        // Miembros: solo TENANT_ADMIN (una única guardia de tenant y rol en el montaje)
        router.use('/:tenantId/members', tenantMiddleware.requireMember('TENANT_ADMIN'), MemberRoutes.routes);

        return router;
    }
}
