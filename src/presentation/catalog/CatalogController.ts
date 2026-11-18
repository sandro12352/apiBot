import type { Request, Response } from "express";
import { CreateCatalogItemDto, CustomError, UpdateCatalogItemDto, type CatalogService } from "../../domain";

// Rutas /tenants/:tenantId/catalog: TenantMiddleware ya validó membresía y rol (req.tenant)
export class CatalogController {

    constructor(
        private readonly service: CatalogService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error instanceof Error ? error.name : "error");
        return res.status(500).json({ error: "Internal server error" });
    };

    public list = (req: Request, res: Response) => {
        const { status, category } = req.query;
        if (status !== undefined && status !== "ACTIVE" && status !== "INACTIVE") {
            return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
        }
        if (category !== undefined && (typeof category !== "string" || category.length > 100)) {
            return res.status(400).json({ error: "Invalid category" });
        }

        this.service
            .list(req.tenant!.id, { status, category })
            .then((items) => res.json(items))
            .catch((error) => this.handleError(error, res));
    };

    public get = (req: Request, res: Response) => {
        this.service
            .get(req.tenant!.id, String(req.params.id))
            .then((item) => res.json(item))
            .catch((error) => this.handleError(error, res));
    };

    public create = (req: Request, res: Response) => {
        const [error, dto] = CreateCatalogItemDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .create(req.tenant!.id, dto!, req.user!.id)
            .then((item) => res.status(201).json(item))
            .catch((error) => this.handleError(error, res));
    };

    public update = (req: Request, res: Response) => {
        const [error, dto] = UpdateCatalogItemDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .update(req.tenant!.id, String(req.params.id), dto!, req.user!.id)
            .then((item) => res.json(item))
            .catch((error) => this.handleError(error, res));
    };

    public remove = (req: Request, res: Response) => {
        this.service
            .remove(req.tenant!.id, String(req.params.id), req.user!.id)
            .then(() => res.status(204).send())
            .catch((error) => this.handleError(error, res));
    };

    // El cuerpo es el archivo de la imagen (express.raw en la ruta)
    public addImage = (req: Request, res: Response) => {
        this.service
            .addImage(req.tenant!.id, String(req.params.id), req.body, req.headers["content-type"], req.user!.id)
            .then((item) => res.status(201).json(item))
            .catch((error) => this.handleError(error, res));
    };

    public removeImage = (req: Request, res: Response) => {
        this.service
            .removeImage(req.tenant!.id, String(req.params.id), String(req.params.imageId), req.user!.id)
            .then(() => res.status(204).send())
            .catch((error) => this.handleError(error, res));
    };
}
