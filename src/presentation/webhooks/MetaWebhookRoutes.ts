import { Router } from "express";
import { buildMetaWebhookService } from "../auth/auth.factory";
import { webhookRateLimit } from "../middlewares/rate-limit.middleware";
import { MetaWebhookController } from "./MetaWebhookController";


export class MetaWebhookRoutes {

    static get routes(): Router {
        const router = Router();
        const controller = new MetaWebhookController(buildMetaWebhookService());

        // Rutas públicas (sin JWT): la autenticidad la da la firma HMAC de Meta
        router.use(webhookRateLimit);
        router.get('/', controller.verify);
        router.post('/', controller.receive);

        return router;
    }
}
