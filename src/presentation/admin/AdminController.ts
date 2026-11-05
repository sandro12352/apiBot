import type { Request, Response } from "express";
import { CreateClientDto, CustomError, type AdminService } from "../../domain";


export class AdminController {

    constructor(
        private readonly adminService: AdminService,
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
            .createClient(dto!)
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

}
