import { Router } from "express";
import { AuthController } from "./AuthController";


export class AuthRoutes {

    static get routes(): Router {
        const router = Router();
        const authController = new AuthController();

        router.post('/login', authController.login);

        return router;
    }
}