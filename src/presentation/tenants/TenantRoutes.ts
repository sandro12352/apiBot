import { Router } from "express";
import { TenantController } from "./TenantController";
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

        return router;
    }
}
