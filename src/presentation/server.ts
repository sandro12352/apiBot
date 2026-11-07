import express, { Router, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { envs } from "../config/envs";
import { globalRateLimit } from "./middlewares/rate-limit.middleware";

export interface Options {
    port: number;
    routes: Router;
}

export class Server {
    private readonly app = express();
    private readonly port: number;
    private readonly routes: Router;


    constructor(options: Options) {
        const { port, routes } = options;
        this.port = port;
        this.routes = routes;
    }


    async start() {

        // Detrás del proxy inverso: req.ip toma la IP real del cliente (rate limit y auditoría)
        this.app.set('trust proxy', envs.TRUST_PROXY);
        this.app.disable('x-powered-by');

        // Middleware
        this.app.use(helmet());
        // Sin CORS_ORIGINS no se permite ningún origen de navegador
        this.app.use(cors({ origin: envs.CORS_ORIGINS }));
        this.app.use(globalRateLimit);
        this.app.use(express.json({ limit: envs.JSON_BODY_LIMIT }));
        this.app.use(express.urlencoded({ extended: true, limit: envs.JSON_BODY_LIMIT }));

        // Routes
        this.app.use(this.routes);

        // 404 en JSON para rutas inexistentes
        this.app.use((req: Request, res: Response) => {
            res.status(404).json({ error: 'Not found' });
        });

        // Errores no controlados (JSON mal formado, body demasiado grande, etc.)
        this.app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
            const status = typeof error?.status === 'number' && error.status < 500 ? error.status : 500;
            if (status === 500) console.error('[Server] Unhandled error', error);
            res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Invalid request' });
        });

        this.app.listen(this.port, () => {
            console.log(`Server is running on port ${this.port}`);
        });

    }

}
