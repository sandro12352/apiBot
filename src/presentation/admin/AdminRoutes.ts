import { Router } from "express";
import { AdminController } from "./AdminController";
import { AdminService } from "../../domain";
import { AdminDatasourceImpl } from "../../infrastructure/datasource/admin.datasource.impl";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { AdminRepositoryImpl } from "../../infrastructure/repositories/admin.repository.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import {
    buildAuditService,
    buildAuthMiddleware,
    buildAuthService,
    buildTenantService,
} from "../auth/auth.factory";
import { UserRoutes } from "../user/UserRoutes";


export class AdminRoutes {

    static get routes(): Router {
        const router = Router();
        const adminService = new AdminService(
            new AdminRepositoryImpl(new AdminDatasourceImpl()),
            new UserRepositoryImpl(new UserDatasourceImpl()),
            buildAuthService(),
            buildAuditService(),
        );
        const adminController = new AdminController(adminService, buildTenantService());
        const authMiddleware = buildAuthMiddleware();

        // Todo /admin exige un administrador de plataforma autenticado
        router.use(authMiddleware.authenticate, authMiddleware.requirePlatformAdmin);

        router.post('/clients', adminController.createClient);
        router.post('/users/:id/setup-email', adminController.resendSetupEmail);
        router.use('/users', UserRoutes.routes);

        router.get('/tenants', adminController.getTenants);
        router.get('/tenants/:id', adminController.getTenant);
        router.patch('/tenants/:id/status', adminController.updateTenantStatus);

        return router;
    }
}
