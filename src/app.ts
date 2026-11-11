import { envs } from "./config/envs";
import { AppRoutes } from "./presentation/routes";
import { Server } from "./presentation/server";
import { buildMetaWebhookService } from "./presentation/auth/auth.factory";
import { WebhookReprocessor } from "./presentation/webhooks/WebhookReprocessor";



const main = async () => {
    const server = new Server({
        port:envs.PORT || 3000,
        routes:AppRoutes.routes,
    });

    await server.start();

    // Reintenta los mensajes fallidos o sin terminar (provisional hasta BullMQ)
    new WebhookReprocessor(buildMetaWebhookService()).start();
}


(async () => { 
    await main();
})();