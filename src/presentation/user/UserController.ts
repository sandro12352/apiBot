import type { Request, Response } from "express";
import { prisma } from "../../data/postgres"
import { CreateUserDto, type UserService } from "../../domain";


export class UserController {
    constructor(
        private readonly userService:UserService,
    ) {}


    public getUsers = async (req: Request, res: Response)=>{

        this.userService
        .getAll()
        .then(users=>res.json(users))
        .catch(error=>res.status(400).json({error:error.message}));

    } 


    public createUser = async (req: Request, res: Response)=>{
        const [error,createUserDto] = CreateUserDto.create(req.body);
        if(error) return res.status(400).json({error});

        this.userService
        .create(createUserDto!)
        .then(user=>res.json(user))
        .catch(error=>res.status(400).json({error:error.message}));
    }

}