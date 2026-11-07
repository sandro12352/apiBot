import type { Request, Response } from "express";
import {
    CreateUserDto,
    CustomError,
    ForgotPasswordDto,
    LoginDto,
    RefreshTokenDto,
    ResendVerificationDto,
    ResetPasswordDto,
    VerifyEmailDto,
    type AuthService,
    type TenantService,
    type UserService,
} from "../../domain";
import { requestMeta } from "../middlewares/auth.middleware";



export class AuthController {


    constructor(
        private readonly authService: AuthService,
        private readonly userService: UserService,
        private readonly tenantService: TenantService,
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
            .login(loginDto!, requestMeta(req))
            .then(({ user, accessToken, refreshToken }) =>
                res.json({ user: user.toPublic(), accessToken, refreshToken }))
            .catch(error => this.handleError(error, res));
    }

    public refresh = (req: Request, res: Response) => {
        const [error, dto] = RefreshTokenDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.authService
            .refresh(dto!, requestMeta(req))
            .then(tokens => res.json(tokens))
            .catch(error => this.handleError(error, res));
    }

    // Requiere authenticate: cierra la sesión del access token usado
    public logout = (req: Request, res: Response) => {
        this.authService
            .logout(req.user!.sessionId)
            .then(() => res.status(204).send())
            .catch(error => this.handleError(error, res));
    }

    public logoutAll = (req: Request, res: Response) => {
        this.authService
            .logoutAll(req.user!.id, requestMeta(req))
            .then(() => res.status(204).send())
            .catch(error => this.handleError(error, res));
    }

    // Usuario autenticado y sus empresas con su rol (el frontend elige el tenantId)
    public me = (req: Request, res: Response) => {
        Promise.all([
            this.userService.getById(req.user!.id),
            this.tenantService.getForUser(req.user!.id),
        ])
            .then(([user, tenants]) => res.json({
                user: user.toPublic(),
                tenants: tenants.map(({ tenant, role }) => ({
                    id: tenant.id,
                    name: tenant.name,
                    slug: tenant.slug,
                    status: tenant.status,
                    role,
                })),
            }))
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
