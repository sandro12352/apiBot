import type { Request, Response } from "express";
import { CustomError, UpdateUserDto, type UserService } from "../../domain";


// Administración de usuarios (montado en /admin/users, solo administradores de plataforma)
export class UserController {
    constructor(
        private readonly userService: UserService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }


    public getUsers = (req: Request, res: Response) => {
        this.userService
            .getAll()
            .then(users => res.json(users.map(user => user.toPublic())))
            .catch(error => this.handleError(error, res));
    }

    public updateUser = (req: Request, res: Response) => {
        const { id } = req.params;
        if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

        const [error, updateUserDto] = UpdateUserDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.userService
            .update(id, updateUserDto!, req.user!.id)
            .then(user => res.json(user.toPublic()))
            .catch(error => this.handleError(error, res));
    }

    public deleteUser = (req: Request, res: Response) => {
        const { id } = req.params;
        if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

        this.userService
            .delete(id, req.user!.id)
            .then(() => res.status(204).send())
            .catch(error => this.handleError(error, res));
    }

}
