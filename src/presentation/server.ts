import express, { Router, type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { envs } from "../config/envs";
import { globalRateLimit } from "./middlewares/rate-limit.middleware";

export interface Options {
    port: number;
    routes: Router;
}

// Construye la app Express (middlewares, rutas y manejo de errores) sin abrir ningún
// puerto: así la usa tanto el servidor como los tests de integración.
export const buildApp = (routes: Router): Express => {
    const app = express();

    // Detrás del proxy inverso: req.ip toma la IP real del cliente (rate limit y auditoría)
    app.set('trust proxy', envs.TRUST_PROXY);
    app.disable('x-powered-by');

    // Middleware
    app.use(helmet());
    // Sin CORS_ORIGINS no se permite ningún origen de navegador
    app.use(cors({ origin: envs.CORS_ORIGINS }));
    app.use(globalRateLimit);
    app.use(express.json({ limit: envs.JSON_BODY_LIMIT }));
    app.use(express.urlencoded({ extended: true, limit: envs.JSON_BODY_LIMIT }));

    // Routes
    app.use(routes);

    // 404 en JSON para rutas inexistentes
    app.use((req: Request, res: Response) => {
        res.status(404).json({ error: 'Not found' });
    });

    // Errores no controlados (JSON mal formado, body demasiado grande, etc.)
    app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
        const status = typeof error?.status === 'number' && error.status < 500 ? error.status : 500;
        if (status === 500) console.error('[Server] Unhandled error', error);
        res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Invalid request' });
    });

    return app;
};


export class Server {
    private readonly port: number;
    private readonly routes: Router;


    constructor(options: Options) {
        const { port, routes } = options;
        this.port = port;
        this.routes = routes;
    }


    async start() {
        const app = buildApp(this.routes);

        app.listen(this.port, () => {
            console.log(`Server is running on port ${this.port}`);
        });

    }

}
