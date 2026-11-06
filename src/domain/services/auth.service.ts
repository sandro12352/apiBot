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
import type { UserTokenType } from "../entities/user-token.entity";
import type { UserEntity } from "../entities/user.entity";
import { CustomError } from "../errors/custom.error";
import type { AuthRepository } from "../repositories/auth.repository";
import type { UserService } from "./user.service";
import { renderAccountSetupEmail } from "../../templates/account-setup.template";

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const ACCOUNT_SETUP_TTL_MS = 72 * 60 * 60 * 1000;
const INVALID_TOKEN_MESSAGE = 'Invalid or expired token';

const hashToken = (token: string): string =>
    createHash("sha256").update(token).digest("hex");


export class AuthService {

    constructor(
        private readonly authRepository: AuthRepository,
        private readonly passwordHasher: PasswordHasher,
        private readonly tokenSigner: TokenSigner,
        private readonly emailSender: EmailSender,
        private readonly userService: UserService,
        private readonly appUrl: string,
        private readonly appName: string,
    ) {}


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

    async login(loginDto: LoginDto): Promise<{ user: UserEntity; token: string }> {
        try {
            const user = await this.authRepository.findByEmail(loginDto.email);

            // Mismo mensaje si el email no existe, el usuario no tiene contraseña
            // (cuenta de proveedor externo) o la contraseña es incorrecta,
            // para no revelar qué emails están registrados.
            if (!user || !user.passwordHash) throw CustomError.unauthorized('Invalid credentials');

            const isMatch = await this.passwordHasher.compare(loginDto.password, user.passwordHash);
            if (!isMatch) throw CustomError.unauthorized('Invalid credentials');

            if (user.status === 'SUSPENDED') throw CustomError.forbidden('User is suspended');

            const token = this.tokenSigner.sign({ id: user.id });

            return { user, token };
        } catch (error) {
            this.handleError(error, 'login');
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
        } catch (error) {
            this.handleError(error, 'resetPassword');
        }
    }

}
