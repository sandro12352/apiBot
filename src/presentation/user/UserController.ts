import type { Request, Response } from "express";
import { CreateUserDto, CustomError, type UserService } from "../../domain";


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


    public createUser = (req: Request, res: Response) => {
        const [error, createUserDto] = CreateUserDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.userService
            .create(createUserDto!)
            .then(user => res.status(201).json(user.toPublic()))
            .catch(error => this.handleError(error, res));
    }

}
