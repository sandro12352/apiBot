import { Router } from "express";
import { AdminController } from "./AdminController";
import { AdminService } from "../../domain";
import { AdminDatasourceImpl } from "../../infrastructure/datasource/admin.datasource.impl";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { AdminRepositoryImpl } from "../../infrastructure/repositories/admin.repository.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import { buildAuthMiddleware, buildAuthService } from "../auth/auth.factory";


export class AdminRoutes {

    static get routes(): Router {
        const router = Router();
        const adminService = new AdminService(
            new AdminRepositoryImpl(new AdminDatasourceImpl()),
            new UserRepositoryImpl(new UserDatasourceImpl()),
            buildAuthService(),
        );
        const adminController = new AdminController(adminService);
        const authMiddleware = buildAuthMiddleware();

        // Todo /admin exige un administrador de plataforma autenticado
        router.use(authMiddleware.authenticate, authMiddleware.requirePlatformAdmin);

        router.post('/clients', adminController.createClient);
        router.post('/users/:id/setup-email', adminController.resendSetupEmail);

        return router;
    }
}
