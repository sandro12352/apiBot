import { Router } from "express";
import { MemberController } from "./MemberController";
import { buildMemberService } from "../auth/auth.factory";
import { authRateLimit } from "../middlewares/rate-limit.middleware";


// Se monta en TenantRoutes bajo /:tenantId/members, detrás de
// requireMember('TENANT_ADMIN'): aquí no hace falta volver a comprobar el rol.
export class MemberRoutes {

    static get routes(): Router {
        // mergeParams: expone :tenantId (lo usa TenantMiddleware al montar) a este router
        const router = Router({ mergeParams: true });
        const memberController = new MemberController(buildMemberService());

        router.get('/', memberController.list);
        // Envían correos: límite estricto por IP
        router.post('/', authRateLimit, memberController.add);
        router.patch('/:userId', memberController.changeRole);
        router.delete('/:userId', memberController.remove);
        router.post('/:userId/setup-email', authRateLimit, memberController.resendSetupEmail);

        return router;
    }
}
