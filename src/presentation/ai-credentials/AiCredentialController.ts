import type { Request, Response } from "express";
import {
    CustomError,
    SaveAiCredentialDto,
    type AIProviderName,
    type AiCredentialService,
} from "../../domain";

const PROVIDERS = ["GEMINI", "OPENAI", "ANTHROPIC"] as const;

// Rutas /tenants/:tenantId/ai-credentials: TenantMiddleware ya validó membresía y rol (req.tenant)
export class AiCredentialController {

    constructor(
        private readonly service: AiCredentialService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error instanceof Error ? error.name : 'error');
        return res.status(500).json({ error: 'Internal server error' });
    }

    private provider(req: Request): AIProviderName | null {
        const value = typeof req.params.provider === 'string' ? req.params.provider.toUpperCase() : '';
        return (PROVIDERS as readonly string[]).includes(value) ? (value as AIProviderName) : null;
    }


    public list = (req: Request, res: Response) => {
        this.service
            .list(req.tenant!.id)
            .then(credentials => res.json(credentials))
            .catch(error => this.handleError(error, res));
    }

    public save = (req: Request, res: Response) => {
        const provider = this.provider(req);
        if (!provider) return res.status(400).json({ error: 'Invalid provider' });

        const [error, dto] = SaveAiCredentialDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.service
            .save(req.tenant!.id, provider, dto!, req.user!.id)
            .then(credential => res.json(credential))
            .catch(error => this.handleError(error, res));
    }

    public test = (req: Request, res: Response) => {
        const provider = this.provider(req);
        if (!provider) return res.status(400).json({ error: 'Invalid provider' });

        this.service
            .test(req.tenant!.id, provider, req.user!.id)
            .then(credential => res.json(credential))
            .catch(error => this.handleError(error, res));
    }

    public models = (req: Request, res: Response) => {
        const provider = this.provider(req);
        if (!provider) return res.status(400).json({ error: 'Invalid provider' });

        this.service
            .models(req.tenant!.id, provider)
            .then(models => res.json(models))
            .catch(error => this.handleError(error, res));
    }

    public remove = (req: Request, res: Response) => {
        const provider = this.provider(req);
        if (!provider) return res.status(400).json({ error: 'Invalid provider' });

        this.service
            .remove(req.tenant!.id, provider, req.user!.id)
            .then(() => res.status(204).send())
            .catch(error => this.handleError(error, res));
    }

}
