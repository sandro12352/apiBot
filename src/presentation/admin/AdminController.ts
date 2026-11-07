import type { Request, Response } from "express";
import {
    CreateClientDto,
    CustomError,
    UpdateTenantStatusDto,
    type AdminService,
    type TenantService,
} from "../../domain";


export class AdminController {

    constructor(
        private readonly adminService: AdminService,
        private readonly tenantService: TenantService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }


    // Alta manual de un cliente tras el pago: usuario + empresa + enlace para definir contraseña
    public createClient = (req: Request, res: Response) => {
        const [error, dto] = CreateClientDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.adminService
            .createClient(dto!, req.user!.id)
            .then(({ user, tenantId, tenantSlug }) =>
                res.status(201).json({ user: user.toPublic(), tenantId, tenantSlug }))
            .catch(error => this.handleError(error, res));
    }

    public resendSetupEmail = (req: Request, res: Response) => {
        const { id } = req.params;
        if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

        this.adminService
            .resendSetupEmail(id)
            .then(() => res.status(202).json({ message: 'Setup email sent' }))
            .catch(error => this.handleError(error, res));
    }

    public getTenants = (req: Request, res: Response) => {
        this.tenantService
            .getAll()
            .then(tenants => res.json(tenants))
            .catch(error => this.handleError(error, res));
    }

    public getTenant = (req: Request, res: Response) => {
        const { id } = req.params;
        if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

        this.tenantService
            .getById(id)
            .then(tenant => res.json(tenant))
            .catch(error => this.handleError(error, res));
    }

    // Suspender, reactivar o cancelar una empresa
    public updateTenantStatus = (req: Request, res: Response) => {
        const { id } = req.params;
        if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' });

        const [error, dto] = UpdateTenantStatusDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.tenantService
            .updateStatus(id, dto!, req.user!.id)
            .then(tenant => res.json(tenant))
            .catch(error => this.handleError(error, res));
    }

}
