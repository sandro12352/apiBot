import { Router } from "express";
import { AiCredentialController } from "./AiCredentialController";
import { buildAiCredentialService } from "../auth/auth.factory";
import { authRateLimit } from "../middlewares/rate-limit.middleware";


// Se monta en TenantRoutes bajo /:tenantId/ai-credentials, detrás de requireMember('TENANT_ADMIN').
export class AiCredentialRoutes {

    static get routes(): Router {
        const router = Router({ mergeParams: true });
        const controller = new AiCredentialController(buildAiCredentialService());

        router.get('/', controller.list);
        // Llaman al proveedor de IA: límite estricto por IP
        router.put('/:provider', authRateLimit, controller.save);
        router.post('/:provider/test', authRateLimit, controller.test);
        router.get('/:provider/models', authRateLimit, controller.models);
        router.delete('/:provider', controller.remove);

        return router;
    }
}
