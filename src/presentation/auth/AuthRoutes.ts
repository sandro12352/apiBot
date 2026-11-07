import { Router } from "express";
import { AuthController } from "./AuthController";
import { buildAuthMiddleware, buildAuthService, buildTenantService } from "./auth.factory";
import { envs } from "../../config/envs";
import { UserService } from "../../domain";
import { BcryptAdapter } from "../../config/adapters/bcrypt.adapter";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import { authRateLimit } from "../middlewares/rate-limit.middleware";


export class AuthRoutes {

    static get routes(): Router {
        const router = Router();
        const authController = new AuthController(
            buildAuthService(),
            new UserService(new UserRepositoryImpl(new UserDatasourceImpl()), new BcryptAdapter()),
            buildTenantService(),
        );
        const authMiddleware = buildAuthMiddleware();

        if (envs.ALLOW_PUBLIC_REGISTER) {
            router.post('/register', authRateLimit, authController.register);
        }
        router.post('/login', authRateLimit, authController.login);
        router.post('/refresh', authRateLimit, authController.refresh);
        router.post('/verify-email/request', authRateLimit, authController.requestEmailVerification);
        router.post('/verify-email', authRateLimit, authController.verifyEmail);
        router.post('/forgot-password', authRateLimit, authController.forgotPassword);
        router.post('/reset-password', authRateLimit, authController.resetPassword);

        // Requieren sesión
        router.post('/logout', authMiddleware.authenticate, authController.logout);
        router.post('/logout-all', authMiddleware.authenticate, authController.logoutAll);
        router.get('/me', authMiddleware.authenticate, authController.me);

        return router;
    }
}
