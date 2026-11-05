import { Router } from "express";
import { UserController } from "./UserController";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import { UserService } from "../../domain";
import { BcryptAdapter } from "../../config/adapters/bcrypt.adapter";
import { buildAuthMiddleware } from "../auth/auth.factory";



export class UserRoutes {
    static get routes(): Router {
        const router = Router();
        const datasource = new UserDatasourceImpl();
        const userRepository = new UserRepositoryImpl(datasource);
        const userService = new UserService(userRepository, new BcryptAdapter());
        const userController = new UserController(userService);

        const authMiddleware = buildAuthMiddleware();

        // Administración de usuarios: solo administradores de plataforma.
        // El alta de clientes se hace en POST /admin/clients.
        router.use(authMiddleware.authenticate, authMiddleware.requirePlatformAdmin);

        router.get('/todos', userController.getUsers);
        router.patch('/:id', userController.updateUser);
        router.delete('/:id', userController.deleteUser);

        return router;
    }

}