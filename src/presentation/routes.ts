import { Router } from "express";
import { AuthRoutes } from "./auth/AuthRoutes";
import { AdminRoutes } from "./admin/AdminRoutes";
import { TenantRoutes } from "./tenants/TenantRoutes";
import { MetaWebhookRoutes } from "./webhooks/MetaWebhookRoutes";


export class AppRoutes {

    static get routes(): Router {
        const router = Router();

        router.use('/auth', AuthRoutes.routes);
        // Incluye los módulos de la empresa: /tenants/:tenantId/members y /whatsapp
        router.use('/tenants', TenantRoutes.routes);
        // Incluye /admin/users (antes /user)
        router.use('/admin', AdminRoutes.routes);
        // Público: lo llama Meta, se autentica por firma
        router.use('/webhooks/meta', MetaWebhookRoutes.routes);

        return router;

    }

}
