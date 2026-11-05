import { Router } from "express";
import { AuthController } from "./AuthController";
import { buildAuthService } from "./auth.factory";
import { envs } from "../../config/envs";


export class AuthRoutes {

    static get routes(): Router {
        const router = Router();
        const authController = new AuthController(buildAuthService());

        if (envs.ALLOW_PUBLIC_REGISTER) {
            router.post('/register', authController.register);
        }
        router.post('/login', authController.login);
        router.post('/verify-email/request', authController.requestEmailVerification);
        router.post('/verify-email', authController.verifyEmail);
        router.post('/forgot-password', authController.forgotPassword);
        router.post('/reset-password', authController.resetPassword);

        return router;
    }
}
