import { Router } from "express";
import { UserController } from "./UserController";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import { UserService } from "../../domain";
import { BcryptAdapter } from "../../config/adapters/bcrypt.adapter";
import { buildAuditService } from "../auth/auth.factory";


// Se monta dentro de /admin (AdminRoutes), que ya exige administrador de plataforma
export class UserRoutes {
    static get routes(): Router {
        const router = Router();
        const userService = new UserService(
            new UserRepositoryImpl(new UserDatasourceImpl()),
            new BcryptAdapter(),
            buildAuditService(),
        );
        const userController = new UserController(userService);

        router.get('/', userController.getUsers);
        router.patch('/:id', userController.updateUser);
        router.delete('/:id', userController.deleteUser);

        return router;
    }

}
