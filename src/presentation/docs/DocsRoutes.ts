import { Router } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../../docs/openapi";

// Documentación interactiva de la API en /docs (JSON en /docs/openapi.json).
// Solo fuera de producción: revela toda la superficie de la API.
export class DocsRoutes {

    static get routes(): Router {
        const router = Router();

        // Swagger UI inyecta scripts y estilos propios: la política de contenido de helmet
        // se relaja únicamente en esta ruta (el resto de la API la mantiene).
        router.use(helmet({ contentSecurityPolicy: false }));
        router.get('/openapi.json', (_req, res) => { res.json(openApiDocument); });
        router.use('/', swaggerUi.serve, swaggerUi.setup(openApiDocument, {
            customSiteTitle: 'API del chatbot',
            swaggerOptions: { persistAuthorization: true },
        }));

        return router;
    }

}
