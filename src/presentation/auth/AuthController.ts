import type { Request, Response } from "express";
import {
    CreateUserDto,
    CustomError,
    ForgotPasswordDto,
    LoginDto,
    ResendVerificationDto,
    ResetPasswordDto,
    VerifyEmailDto,
    type AuthService,
} from "../../domain";



export class AuthController {


    constructor(
        private readonly authService: AuthService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }


    public register = (req: Request, res: Response) => {
        const [error, createUserDto] = CreateUserDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .register(createUserDto!)
            .then(user => res.status(201).json(user.toPublic()))
            .catch(error => this.handleError(error, res));
    }

    public login = (req: Request, res: Response) => {
        const [error, loginDto] = LoginDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .login(loginDto!)
            .then(({ user, token }) => res.json({ user: user.toPublic(), token }))
            .catch(error => this.handleError(error, res));
    }

    // Respuesta genérica (202) exista o no el email
    public requestEmailVerification = (req: Request, res: Response) => {
        const [error, dto] = ResendVerificationDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .requestEmailVerification(dto!)
            .then(() => res.status(202).json({ message: 'If the account exists, a verification email was sent' }))
            .catch(error => this.handleError(error, res));
    }

    public verifyEmail = (req: Request, res: Response) => {
        const [error, dto] = VerifyEmailDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .verifyEmail(dto!)
            .then(() => res.json({ message: 'Email verified' }))
            .catch(error => this.handleError(error, res));
    }

    // Respuesta genérica (202) exista o no el email
    public forgotPassword = (req: Request, res: Response) => {
        const [error, dto] = ForgotPasswordDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .forgotPassword(dto!)
            .then(() => res.status(202).json({ message: 'If the account exists, a recovery email was sent' }))
            .catch(error => this.handleError(error, res));
    }

    public resetPassword = (req: Request, res: Response) => {
        const [error, dto] = ResetPasswordDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .resetPassword(dto!)
            .then(() => res.json({ message: 'Password updated' }))
            .catch(error => this.handleError(error, res));
    }

}
