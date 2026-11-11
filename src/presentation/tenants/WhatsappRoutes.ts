import { Router } from "express";
import { WhatsappController } from "./WhatsappController";
import { buildWhatsappConnectionService } from "../auth/auth.factory";
import { authRateLimit } from "../middlewares/rate-limit.middleware";


// Se monta en TenantRoutes bajo /:tenantId/whatsapp, detrás de requireMember('TENANT_ADMIN').
export class WhatsappRoutes {

    static get routes(): Router {
        const router = Router({ mergeParams: true });
        const controller = new WhatsappController(buildWhatsappConnectionService());

        router.get('/', controller.get);
        // Llaman a Meta: límite estricto por IP
        router.put('/', authRateLimit, controller.connect);
        router.post('/check', authRateLimit, controller.check);
        router.delete('/', controller.disconnect);

        return router;
    }
}
