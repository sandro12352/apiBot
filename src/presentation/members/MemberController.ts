import type { Request, Response } from "express";
import { AddMemberDto, CustomError, UpdateMemberRoleDto, type MemberService } from "../../domain";

const UUID = /^[0-9a-f-]{36}$/i;

// Rutas /tenants/:tenantId/members: TenantMiddleware ya validó membresía y rol (req.tenant)
export class MemberController {

    constructor(
        private readonly memberService: MemberService,
    ) {}

    private handleError = (error: unknown, res: Response) => {
        if (error instanceof CustomError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        console.error(error);
        return res.status(500).json({ error: 'Internal server error' });
    }

    // Un userId mal formado equivale a un miembro inexistente
    private memberId(req: Request): string | null {
        const { userId } = req.params;
        return typeof userId === 'string' && UUID.test(userId) ? userId : null;
    }


    public list = (req: Request, res: Response) => {
        this.memberService
            .list(req.tenant!.id)
            .then(members => res.json(members))
            .catch(error => this.handleError(error, res));
    }

    public add = (req: Request, res: Response) => {
        const [error, dto] = AddMemberDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.memberService
            .add(req.tenant!.id, dto!, req.user!.id)
            .then(member => res.status(201).json(member))
            .catch(error => this.handleError(error, res));
    }

    public changeRole = (req: Request, res: Response) => {
        const userId = this.memberId(req);
        if (!userId) return res.status(404).json({ error: 'Member not found' });

        const [error, dto] = UpdateMemberRoleDto.create(req.body);
        if (error) return res.status(400).json({ error });

        this.memberService
            .changeRole(req.tenant!.id, userId, dto!, req.user!.id)
            .then(member => res.json(member))
            .catch(error => this.handleError(error, res));
    }

    public remove = (req: Request, res: Response) => {
        const userId = this.memberId(req);
        if (!userId) return res.status(404).json({ error: 'Member not found' });

        this.memberService
            .remove(req.tenant!.id, userId, req.user!.id)
            .then(() => res.status(204).send())
            .catch(error => this.handleError(error, res));
    }

    public resendSetupEmail = (req: Request, res: Response) => {
        const userId = this.memberId(req);
        if (!userId) return res.status(404).json({ error: 'Member not found' });

        this.memberService
            .resendSetupEmail(req.tenant!.id, userId)
            .then(() => res.status(202).json({ message: 'Setup email sent' }))
            .catch(error => this.handleError(error, res));
    }

}
