import type { Request, Response } from "express";
import { CustomError, UpsertAssistantDto, type AssistantService } from "../../domain";

// Rutas /tenants/:tenantId/assistant: TenantMiddleware ya validó membresía y rol (req.tenant)
export class AssistantController {

    constructor(
        private readonly service: AssistantService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error instanceof Error ? error.name : 'error');
        return res.status(500).json({ error: 'Internal server error' });
    }


    public get = (req: Request, res: Response) => {
        this.service
            .get(req.tenant!.id)
            .then(assistant => res.json(assistant))
            .catch(error => this.handleError(error, res));
    }

    public upsert = (req: Request, res: Response) => {
        const [error, dto] = UpsertAssistantDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .upsert(req.tenant!.id, dto!, req.user!.id)
            .then(assistant => res.json(assistant))
            .catch(error => this.handleError(error, res));
    }

}
