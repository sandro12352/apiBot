import type { Request, Response } from "express";
import { ConnectWhatsappDto, CustomError, type WhatsappConnectionService } from "../../domain";

// Rutas /tenants/:tenantId/whatsapp: TenantMiddleware ya validó membresía y rol (req.tenant)
export class WhatsappController {

    constructor(
        private readonly service: WhatsappConnectionService,
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
            .then(connection => res.json(connection))
            .catch(error => this.handleError(error, res));
    }

    // 201 al crear, 200 al reemplazar credenciales
    public connect = (req: Request, res: Response) => {
        const [error, dto] = ConnectWhatsappDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .connect(req.tenant!.id, dto!, req.user!.id)
            .then(({ connection, replaced }) => res.status(replaced ? 200 : 201).json(connection))
            .catch(error => this.handleError(error, res));
    }

    public check = (req: Request, res: Response) => {
        this.service
            .check(req.tenant!.id)
            .then(connection => res.json(connection))
            .catch(error => this.handleError(error, res));
    }

    public disconnect = (req: Request, res: Response) => {
        this.service
            .disconnect(req.tenant!.id, req.user!.id)
            .then(connection => res.json(connection))
            .catch(error => this.handleError(error, res));
    }

}
