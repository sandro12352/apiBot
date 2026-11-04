import { Router } from "express";
import { AuthRoutes } from "./auth/AuthRoutes";
import { UserRoutes } from "./user/UserRoutes";


export class AppRoutes {

    static get routes(): Router {
        const router = Router();

        router.use('/auth', AuthRoutes.routes);
        router.use('/user', UserRoutes.routes);

        return router;

    }

}