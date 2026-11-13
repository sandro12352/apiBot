import { Router } from "express";
import { TenantController } from "./TenantController";
import { MemberRoutes } from "../members/MemberRoutes";
import { WhatsappRoutes } from "../whatsapp/WhatsappRoutes";
import { AiCredentialRoutes } from "../ai-credentials/AiCredentialRoutes";
import { AssistantRoutes } from "../assistant/AssistantRoutes";
import { buildAuthMiddleware, buildTenantMiddleware, buildTenantService } from "../auth/auth.factory";


// Todo lo que cuelga de /tenants/:tenantId: los datos de la empresa y sus módulos (members,
// whatsapp, ...), que viven en su propia carpeta. Cada ruta pasa por requireMember(...roles),
// que valida membresía, rol y estado del tenant.
export class TenantRoutes {

    static get routes(): Router {
        const router = Router();
        const tenantController = new TenantController(buildTenantService());
        const authMiddleware = buildAuthMiddleware();
        const tenantMiddleware = buildTenantMiddleware();

        router.use(authMiddleware.authenticate);

        router.get('/:tenantId', tenantMiddleware.requireMember(), tenantController.getTenant);
        router.patch('/:tenantId', tenantMiddleware.requireMember('TENANT_ADMIN'), tenantController.updateTenant);

        // Módulos de la empresa, cada uno en su carpeta. La guardia de tenant y rol va en el montaje.
        router.use('/:tenantId/members', tenantMiddleware.requireMember('TENANT_ADMIN'), MemberRoutes.routes);
        router.use('/:tenantId/whatsapp', tenantMiddleware.requireMember('TENANT_ADMIN'), WhatsappRoutes.routes);
        router.use('/:tenantId/ai-credentials', tenantMiddleware.requireMember('TENANT_ADMIN'), AiCredentialRoutes.routes);
        router.use('/:tenantId/assistant', tenantMiddleware.requireMember('TENANT_ADMIN'), AssistantRoutes.routes);

        return router;
    }
}
