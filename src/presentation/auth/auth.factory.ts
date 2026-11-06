import { AuthService, UserService } from "../../domain";
import { BcryptAdapter } from "../../config/adapters/bcrypt.adapter";
import { ConsoleEmailAdapter } from "../../config/adapters/console-email.adapter";
import { JwtAdapter } from "../../config/adapters/jwt.adapter";
import { NodemailerAdapter } from "../../config/adapters/nodemailer.adapter";
import { envs } from "../../config/envs";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { AuthDatasourceImpl } from "../../infrastructure/datasource/auth.datasource.impl";
import { UserDatasourceImpl } from "../../infrastructure/datasource/user.datasource.impl";
import { AuthRepositoryImpl } from "../../infrastructure/repositories/auth.repository.impl";
import { UserRepositoryImpl } from "../../infrastructure/repositories/user.repository.impl";

// Cableado compartido del servicio de auth (rutas de auth, admin y scripts)
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
        passwordHasher,
        new JwtAdapter(),
        emailSender,
        userService,
        envs.APP_URL,
        envs.APP_NAME,
    );
};

export const buildAuthMiddleware = (): AuthMiddleware =>
    new AuthMiddleware(new JwtAdapter(), new UserRepositoryImpl(new UserDatasourceImpl()));
