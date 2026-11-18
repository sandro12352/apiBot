import { Router } from "express";
import { AuthRoutes } from "./auth/AuthRoutes";
import { AdminRoutes } from "./admin/AdminRoutes";
import { TenantRoutes } from "./tenants/TenantRoutes";
import { MetaWebhookRoutes } from "./webhooks/MetaWebhookRoutes";
import { MediaRoutes } from "./media/MediaRoutes";


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
        // Público con enlace firmado y temporal: imágenes que descarga WhatsApp
        router.use('/media', MediaRoutes.routes);

        return router;

    }

}
