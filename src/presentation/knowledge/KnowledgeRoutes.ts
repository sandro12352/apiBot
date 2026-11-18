import { Router } from "express";
import { KnowledgeController } from "./KnowledgeController";
import { buildKnowledgeService } from "../auth/auth.factory";


// Se monta en TenantRoutes bajo /:tenantId/knowledge, detrás de requireMember('TENANT_ADMIN').
// FAQ (pregunta + respuesta) y textos (tema + contenido) que la IA usa para responder.
export class KnowledgeRoutes {

    static get routes(): Router {
        const router = Router({ mergeParams: true });
        const controller = new KnowledgeController(buildKnowledgeService());

        router.get('/', controller.list);
        router.post('/', controller.create);
        router.get('/:id', controller.get);
        router.patch('/:id', controller.update);
        router.delete('/:id', controller.remove);

        return router;
    }
}
