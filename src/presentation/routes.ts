import { Router } from "express";
import { AuthRoutes } from "./auth/AuthRoutes";
import { AdminRoutes } from "./admin/AdminRoutes";
import { TenantRoutes } from "./tenants/TenantRoutes";


export class AppRoutes {

    static get routes(): Router {
        const router = Router();

        router.use('/auth', AuthRoutes.routes);
        router.use('/tenants', TenantRoutes.routes);
        // Incluye /admin/users (antes /user)
        router.use('/admin', AdminRoutes.routes);

        return router;

    }

}
