import express, { Router } from "express";
import { CatalogController } from "./CatalogController";
import { buildCatalogService } from "../auth/auth.factory";
import { CATALOG_IMAGE_MAX_BYTES } from "../../domain";


// Se monta en TenantRoutes bajo /:tenantId/catalog, detrás de requireMember('TENANT_ADMIN').
export class CatalogRoutes {

    static get routes(): Router {
        const router = Router({ mergeParams: true });
        const controller = new CatalogController(buildCatalogService());

        router.get('/', controller.list);
        router.post('/', controller.create);
        router.get('/:id', controller.get);
        router.patch('/:id', controller.update);
        router.delete('/:id', controller.remove);

        // Subida de imagen: el cuerpo es el archivo. Solo se leen estos tipos y hasta 5 MB;
        // el servicio vuelve a comprobar el tipo real por su contenido.
        router.post(
            '/:id/images',
            express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: CATALOG_IMAGE_MAX_BYTES }),
            controller.addImage,
        );
        router.delete('/:id/images/:imageId', controller.removeImage);

        return router;
    }
}
