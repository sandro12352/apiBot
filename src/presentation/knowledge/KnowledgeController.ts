import type { Request, Response } from "express";
import { CreateKnowledgeDto, CustomError, UpdateKnowledgeDto, type KnowledgeService, type KnowledgeType } from "../../domain";

const TYPES: KnowledgeType[] = ["FAQ", "TEXT"];

// Rutas /tenants/:tenantId/knowledge: TenantMiddleware ya validó membresía y rol (req.tenant)
export class KnowledgeController {

    constructor(
        private readonly service: KnowledgeService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error instanceof Error ? error.name : "error");
        return res.status(500).json({ error: "Internal server error" });
    };

    public list = (req: Request, res: Response) => {
        const type = req.query.type;
        if (type !== undefined && !TYPES.includes(type as KnowledgeType)) {
            return res.status(400).json({ error: "type must be FAQ or TEXT" });
        }

        this.service
            .list(req.tenant!.id, type as KnowledgeType | undefined)
            .then((entries) => res.json(entries))
            .catch((error) => this.handleError(error, res));
    };

    public get = (req: Request, res: Response) => {
        this.service
            .get(req.tenant!.id, String(req.params.id))
            .then((entry) => res.json(entry))
            .catch((error) => this.handleError(error, res));
    };

    public create = (req: Request, res: Response) => {
        const [error, dto] = CreateKnowledgeDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .create(req.tenant!.id, dto!, req.user!.id)
            .then((entry) => res.status(201).json(entry))
            .catch((error) => this.handleError(error, res));
    };

    public update = (req: Request, res: Response) => {
        const [error, dto] = UpdateKnowledgeDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .update(req.tenant!.id, String(req.params.id), dto!, req.user!.id)
            .then((entry) => res.json(entry))
            .catch((error) => this.handleError(error, res));
    };

    public remove = (req: Request, res: Response) => {
        this.service
            .remove(req.tenant!.id, String(req.params.id), req.user!.id)
            .then(() => res.status(204).send())
            .catch((error) => this.handleError(error, res));
    };
}
