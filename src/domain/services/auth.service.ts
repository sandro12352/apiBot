import { createHash, randomBytes } from "node:crypto";
import type { EmailSender } from "../../config/adapters/email-sender";
import type { PasswordHasher } from "../../config/adapters/password-hasher";
import type { TokenSigner } from "../../config/adapters/token-signer";
import type { CreateUserDto } from "../dtos/create-user.dto";
import type { ForgotPasswordDto } from "../dtos/forgot-password.dto";
import type { LoginDto } from "../dtos/login.dto";
import type { ResendVerificationDto } from "../dtos/resend-verification.dto";
import type { ResetPasswordDto } from "../dtos/reset-password.dto";
import type { VerifyEmailDto } from "../dtos/verify-email.dto";
import type { RefreshTokenDto } from "../dtos/refresh-token.dto";
import { AuditAction } from "../entities/audit.entity";
import type { RequestMeta } from "../entities/session.entity";
import type { UserTokenType } from "../entities/user-token.entity";
import type { UserEntity } from "../entities/user.entity";
import { CustomError } from "../errors/custom.error";
import type { AuthRepository } from "../repositories/auth.repository";
import type { SessionRepository } from "../repositories/session.repository";
import type { AuditService } from "./audit.service";
import type { UserService } from "./user.service";
import { renderAccountSetupEmail } from "../../templates/account-setup.template";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const ACCOUNT_SETUP_TTL_MS = 72 * 60 * 60 * 1000;
const INVALID_TOKEN_MESSAGE = 'Invalid or expired token';
const INVALID_SESSION_MESSAGE = 'Invalid or expired session';
const LOCKED_MESSAGE = 'Too many failed attempts. Try again later';

const hashToken = (token: string): string =>
    createHash("sha256").update(token).digest("hex");

export interface AuthConfig {
    appUrl: string;
    appName: string;
    refreshTokenTtlDays: number;
    loginMaxAttempts: number;
    loginLockMinutes: number;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}


export class AuthService {

    constructor(
        private readonly authRepository: AuthRepository,
        private readonly sessionRepository: SessionRepository,
        private readonly passwordHasher: PasswordHasher,
        private readonly tokenSigner: TokenSigner,
        private readonly emailSender: EmailSender,
        private readonly userService: UserService,
        private readonly auditService: AuditService,
        private readonly config: AuthConfig,
    ) {}

    private get appUrl(): string { return this.config.appUrl; }
    private get appName(): string { return this.config.appName; }

    // Crea la sesión (refresh token opaco, solo se guarda su hash) y firma el access token
    private async createSession(userId: string, meta: RequestMeta): Promise<AuthTokens> {
        const refreshToken = randomBytes(32).toString("hex");
        const session = await this.sessionRepository.create({
            userId,
            refreshTokenHash: hashToken(refreshToken),
            expiresAt: this.refreshExpiry(),
            userAgent: meta.userAgent,
            ip: meta.ip,
        });
        return { accessToken: this.tokenSigner.sign({ id: userId, sid: session.id }), refreshToken };
    }

    private refreshExpiry(): Date {
        return new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
    }


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[AuthService.${action}]`, error);
        throw CustomError.databaseError(`Database error on auth ${action}`);
    }

    // Genera un token aleatorio, guarda solo su hash y devuelve el token en claro
    private async issueToken(userId: string, type: UserTokenType, ttlMs: number): Promise<string> {
        const token = randomBytes(32).toString("hex");
        await this.authRepository.createUserToken({
            userId,
            type,
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + ttlMs),
        });
        return token;
    }

    // El envío no se espera ni propaga errores: así la respuesta no revela
    // (ni por tiempo ni por fallo) si el email existe.
    private sendEmail(to: string, subject: string, text: string, html?: string): void {
        this.emailSender
            .send({ to, subject, text, ...(html ? { html } : {}) })
            .catch((error) => console.error('[AuthService.sendEmail]', error));
    }


    private async sendVerificationEmail(user: UserEntity): Promise<void> {
        const token = await this.issueToken(user.id, 'EMAIL_VERIFICATION', EMAIL_VERIFICATION_TTL_MS);
        const link = `${this.appUrl}/verify-email?token=${token}`;
        this.sendEmail(
            user.email,
            'Verifica tu correo',
            `Verifica tu cuenta abriendo este enlace (válido 24 horas):\n${link}`,
        );
    }


    // Registro público: crea el usuario (UserService) y envía el correo de verificación.
    async register(createUserDto: CreateUserDto): Promise<UserEntity> {
        const user = await this.userService.create(createUserDto);

        // La cuenta ya existe: si falla el token o el correo no se tumba el registro,
        // el usuario puede pedir el reenvío en /auth/verify-email/request.
        try {
            await this.sendVerificationEmail(user);
        } catch (error) {
            console.error('[AuthService.register] verification email failed', error);
        }

        return user;
    }

    async login(loginDto: LoginDto, meta: RequestMeta): Promise<{ user: UserEntity } & AuthTokens> {
        try {
            const user = await this.authRepository.findByEmail(loginDto.email);

            // Mismo mensaje si el email no existe, el usuario no tiene contraseña
            // (cuenta de proveedor externo) o la contraseña es incorrecta,
            // para no revelar qué emails están registrados.
            if (!user || !user.passwordHash) {
                await this.auditLogin(null, 'FAILURE', 'invalid_credentials', meta);
                throw CustomError.unauthorized('Invalid credentials');
            }

            // Cuenta bloqueada temporalmente: no se comprueba la contraseña
            if (user.lockedUntil && user.lockedUntil > new Date()) {
                await this.auditLogin(user.id, 'FAILURE', 'locked', meta);
                throw CustomError.tooManyRequests(LOCKED_MESSAGE);
            }

            const isMatch = await this.passwordHasher.compare(loginDto.password, user.passwordHash);
            if (!isMatch) {
                const lockedNow = await this.authRepository.registerFailedLogin(
                    user.id,
                    this.config.loginMaxAttempts,
                    new Date(Date.now() + this.config.loginLockMinutes * 60 * 1000),
                );
                await this.auditLogin(user.id, 'FAILURE', 'invalid_credentials', meta);
                if (lockedNow) {
                    await this.auditService.record({
                        actorUserId: user.id,
                        tenantId: null,
                        action: AuditAction.AUTH_LOCKOUT,
                        resourceType: 'user',
                        resourceId: user.id,
                        result: 'SUCCESS',
                        metadata: { minutes: this.config.loginLockMinutes, ip: meta.ip },
                    });
                    throw CustomError.tooManyRequests(LOCKED_MESSAGE);
                }
                throw CustomError.unauthorized('Invalid credentials');
            }

            if (user.status === 'SUSPENDED') {
                await this.auditLogin(user.id, 'FAILURE', 'suspended', meta);
                throw CustomError.forbidden('User is suspended');
            }

            await this.authRepository.resetFailedLogins(user.id);
            const tokens = await this.createSession(user.id, meta);
            await this.auditLogin(user.id, 'SUCCESS', null, meta);

            return { user, ...tokens };
        } catch (error) {
            this.handleError(error, 'login');
        }
    }

    private auditLogin(
        userId: string | null,
        result: 'SUCCESS' | 'FAILURE',
        reason: string | null,
        meta: RequestMeta,
    ): Promise<void> {
        return this.auditService.record({
            actorUserId: userId,
            tenantId: null,
            action: AuditAction.AUTH_LOGIN,
            resourceType: 'user',
            resourceId: userId,
            result,
            metadata: { reason, ip: meta.ip },
        });
    }

    // Rota el refresh token: revoca la sesión actual y crea otra.
    // Si llega un refresh ya rotado o revocado se asume robo y se cierran todas las sesiones.
    async refresh(dto: RefreshTokenDto, meta: RequestMeta): Promise<AuthTokens> {
        try {
            const found = await this.sessionRepository.findByRefreshTokenHash(hashToken(dto.refreshToken));
            if (!found) throw CustomError.unauthorized(INVALID_SESSION_MESSAGE);

            const { session, user } = found;

            if (session.revokedAt || session.replacedById) {
                await this.sessionRepository.revokeAllForUser(user.id);
                await this.auditService.record({
                    actorUserId: user.id,
                    tenantId: null,
                    action: AuditAction.AUTH_REFRESH_REUSE,
                    resourceType: 'session',
                    resourceId: session.id,
                    result: 'FAILURE',
                    metadata: { ip: meta.ip },
                });
                throw CustomError.unauthorized(INVALID_SESSION_MESSAGE);
            }

            if (session.expiresAt <= new Date()) throw CustomError.unauthorized(INVALID_SESSION_MESSAGE);
            if (user.status === 'SUSPENDED') throw CustomError.forbidden('User is suspended');

            const refreshToken = randomBytes(32).toString("hex");
            const next = await this.sessionRepository.rotate(session.id, {
                userId: user.id,
                refreshTokenHash: hashToken(refreshToken),
                expiresAt: this.refreshExpiry(),
                userAgent: meta.userAgent,
                ip: meta.ip,
            });
            // Otra petición rotó la sesión a la vez: este refresh ya no es válido
            if (!next) throw CustomError.unauthorized(INVALID_SESSION_MESSAGE);

            return { accessToken: this.tokenSigner.sign({ id: user.id, sid: next.id }), refreshToken };
        } catch (error) {
            this.handleError(error, 'refresh');
        }
    }

    // Cierra solo la sesión actual
    async logout(sessionId: string): Promise<void> {
        try {
            await this.sessionRepository.revoke(sessionId);
        } catch (error) {
            this.handleError(error, 'logout');
        }
    }

    // Cierra todas las sesiones del usuario (todos los dispositivos)
    async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
        try {
            await this.sessionRepository.revokeAllForUser(userId);
            await this.auditService.record({
                actorUserId: userId,
                tenantId: null,
                action: AuditAction.AUTH_LOGOUT_ALL,
                resourceType: 'user',
                resourceId: userId,
                result: 'SUCCESS',
                metadata: { ip: meta.ip },
            });
        } catch (error) {
            this.handleError(error, 'logoutAll');
        }
    }

    // No revela si el email existe: siempre termina sin error.
    async requestEmailVerification(dto: ResendVerificationDto): Promise<void> {
        try {
            const user = await this.authRepository.findByEmail(dto.email);
            if (!user || user.emailVerifiedAt || user.status === 'SUSPENDED') return;

            await this.sendVerificationEmail(user);
        } catch (error) {
            this.handleError(error, 'requestEmailVerification');
        }
    }

    async verifyEmail(dto: VerifyEmailDto): Promise<void> {
        try {
            const record = await this.authRepository.findValidUserToken(
                hashToken(dto.token),
                'EMAIL_VERIFICATION',
            );
            if (!record) throw CustomError.badRequest(INVALID_TOKEN_MESSAGE);

            const consumed = await this.authRepository.verifyEmail(record.id, record.userId);
            if (!consumed) throw CustomError.badRequest(INVALID_TOKEN_MESSAGE);
        } catch (error) {
            this.handleError(error, 'verifyEmail');
        }
    }

    // Cuenta creada por un administrador: envía el enlace para que el cliente defina
    // su contraseña (reutiliza el flujo de reset). A diferencia de los flujos públicos,
    // aquí SÍ se espera al envío y se informa si falla: lo dispara un administrador
    // de confianza, no hay riesgo de enumeración y necesita saber si el correo salió.
    async sendAccountSetupEmail(user: UserEntity): Promise<void> {
        try {
            const token = await this.issueToken(user.id, 'PASSWORD_RESET', ACCOUNT_SETUP_TTL_MS);
            const link = `${this.appUrl}/set-password?token=${token}`;
            const { subject, text, html } = renderAccountSetupEmail({
                appName: this.appName,
                link,
                expiresInHours: ACCOUNT_SETUP_TTL_MS / (60 * 60 * 1000),
            });
            try {
                await this.emailSender.send({ to: user.email, subject, text, html });
            } catch (error) {
                console.error('[AuthService.sendAccountSetupEmail] email failed', error);
                throw CustomError.internalServerError('The account setup email could not be sent');
            }
        } catch (error) {
            this.handleError(error, 'sendAccountSetupEmail');
        }
    }

    // No revela si el email existe: siempre termina sin error.
    async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
        try {
            const user = await this.authRepository.findByEmail(dto.email);
            // Las cuentas sin contraseña (proveedor externo) no tienen nada que recuperar
            if (!user || !user.passwordHash || user.status === 'SUSPENDED') return;

            const token = await this.issueToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);
            const link = `${this.appUrl}/reset-password?token=${token}`;
            this.sendEmail(
                user.email,
                'Recupera tu contraseña',
                `Restablece tu contraseña abriendo este enlace (válido 1 hora):\n${link}\n\nSi no lo solicitaste, ignora este correo.`,
            );
        } catch (error) {
            this.handleError(error, 'forgotPassword');
        }
    }

    async resetPassword(dto: ResetPasswordDto): Promise<void> {
        try {
            const record = await this.authRepository.findValidUserToken(
                hashToken(dto.token),
                'PASSWORD_RESET',
            );
            if (!record) throw CustomError.badRequest(INVALID_TOKEN_MESSAGE);

            // Cuentas creadas por un administrador: deben aceptar política y términos
            // al definir su contraseña.
            if (!record.termsAccepted && !dto.acceptedTerms) {
                throw CustomError.badRequest('You must accept the privacy policy and the terms');
            }

            const passwordHash = await this.passwordHasher.hash(dto.password);
            const consumed = await this.authRepository.resetPassword(
                record.id,
                record.userId,
                passwordHash,
                record.termsAccepted ? null : new Date(),
            );
            if (!consumed) throw CustomError.badRequest(INVALID_TOKEN_MESSAGE);

            // Con la contraseña nueva se cierran todas las sesiones abiertas
            await this.sessionRepository.revokeAllForUser(record.userId);
            await this.auditService.record({
                actorUserId: record.userId,
                tenantId: null,
                action: AuditAction.AUTH_PASSWORD_RESET,
                resourceType: 'user',
                resourceId: record.userId,
                result: 'SUCCESS',
            });
        } catch (error) {
            this.handleError(error, 'resetPassword');
        }
    }

}
