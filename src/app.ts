import { envs } from "./config/envs";
import { AppRoutes } from "./presentation/routes";
import { Server } from "./presentation/server";



const main = async () => {
    const server = new Server({
        port:envs.PORT || 3000,
        routes:AppRoutes.routes,
    });

    await server.start();
}


(async () => { 
    await main();
})();