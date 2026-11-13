import { Router } from "express";
import { AssistantController } from "./AssistantController";
import { buildAssistantService } from "../auth/auth.factory";


// Se monta en TenantRoutes bajo /:tenantId/assistant, detrás de requireMember('TENANT_ADMIN').
export class AssistantRoutes {

    static get routes(): Router {
        const router = Router({ mergeParams: true });
        const controller = new AssistantController(buildAssistantService());

        router.get('/', controller.get);
        router.put('/', controller.upsert);

        return router;
    }
}
