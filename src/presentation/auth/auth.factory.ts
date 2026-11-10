import { AuditService, AuthService, MemberService, TenantService, UserService } from "../../domain";
import { BcryptAdapter } from "../../config/adapters/bcrypt.adapter";
import { ConsoleEmailAdapter } from "../../config/adapters/console-email.adapter";
import { JwtAdapter } from "../../config/adapters/jwt.adapter";
import { NodemailerAdapter } from "../../config/adapters/nodemailer.adapter";
import { envs } from "../../config/envs";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { TenantMiddleware } from "../middlewares/tenant.middleware";
import { AuditDatasourceImpl } from "../../infrastructure/datasource/audit.datasource.impl";
import { AuthDatasourceImpl } from "../../infrastructure/datasource/auth.datasource.impl";
import { SessionDatasourceImpl } from "../../infrastructure/datasource/session.datasource.impl";
import { TenantDatasourceImpl } from "../../infrastructure/datasource/tenant.datasource.impl";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { MemberDatasourceImpl } from "../../infrastructure/datasource/member.datasource.impl";
import { MemberRepositoryImpl } from "../../infrastructure/repositories/member.repository.impl";
import { AuditRepositoryImpl } from "../../infrastructure/repositories/audit.repository.impl";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth.repository.impl";
import { SessionRepositoryImpl } from "../../infrastructure/repositories/session.repository.impl";
import { TenantRepositoryImpl } from "../../infrastructure/repositories/tenant.repository.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";

// Cableado compartido de servicios y middlewares (rutas, admin y scripts)

const buildSessionRepository = () => new SessionRepositoryImpl(new SessionDatasourceImpl());

export const buildAuditService = (): AuditService =>
    new AuditService(new AuditRepositoryImpl(new AuditDatasourceImpl()));

export const buildTenantService = (): TenantService =>
    new TenantService(new TenantRepositoryImpl(new TenantDatasourceImpl()), buildAuditService());

export const buildAuthService = (): AuthService => {
    const passwordHasher = new BcryptAdapter();
    // Sin SMTP configurado se imprime el correo en consola (solo desarrollo)
    const emailSender = envs.SMTP_HOST ? new NodemailerAdapter() : new ConsoleEmailAdapter();
    const userService = new UserService(
        new UserRepositoryImpl(new UserDatasourceImpl()),
        passwordHasher,
    );

    return new AuthService(
        new AuthRepositoryImpl(new AuthDatasourceImpl()),
        buildSessionRepository(),
        passwordHasher,
        new JwtAdapter(),
        emailSender,
        userService,
        buildAuditService(),
        {
            appUrl: envs.APP_URL,
            appName: envs.APP_NAME,
            refreshTokenTtlDays: envs.REFRESH_TOKEN_TTL_DAYS,
            loginMaxAttempts: envs.LOGIN_MAX_ATTEMPTS,
            loginLockMinutes: envs.LOGIN_LOCK_MINUTES,
        },
    );
};

export const buildMemberService = (): MemberService =>
    new MemberService(
        new MemberRepositoryImpl(new MemberDatasourceImpl()),
        new UserRepositoryImpl(new UserDatasourceImpl()),
        buildAuthService(),
        buildAuditService(),
    );

export const buildAuthMiddleware = (): AuthMiddleware =>
    new AuthMiddleware(new JwtAdapter(), buildSessionRepository());

export const buildTenantMiddleware = (): TenantMiddleware =>
    new TenantMiddleware(buildTenantService());
