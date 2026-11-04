import { Router } from "express";
import { UserController } from "./UserController";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";
import { UserService } from "../../domain";



export class UserRoutes {
    static get routes(): Router {
        const router = Router();
        const datasource = new UserDatasourceImpl();
        const userRepository = new UserRepositoryImpl(datasource);
        const userService = new UserService(userRepository);
        const userController = new UserController(userService);

        router.post('/create', userController.createUser);
        router.get('/todos', userController.getUsers);

        return router;
    }

}