import type { Request, Response } from "express";
import { CustomError, UpdateTenantDto, type TenantService } from "../../domain";


// Rutas /tenants/:tenantId: el middleware de tenant ya validó membresía y rol (req.tenant)
export class TenantController {

    constructor(
        private readonly tenantService: TenantService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }


    public getTenant = (req: Request, res: Response) => {
        this.tenantService
            .getById(req.tenant!.id)
            .then(tenant => res.json({ ...tenant, role: req.tenant!.role }))
            .catch(error => this.handleError(error, res));
    }

    public updateTenant = (req: Request, res: Response) => {
        const [error, dto] = UpdateTenantDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.tenantService
            .update(req.tenant!.id, dto!, req.user!.id)
            .then(tenant => res.json(tenant))
            .catch(error => this.handleError(error, res));
    }

}
