import { z } from "zod";
import type { MembershipRole } from "../entities/tenant.entity";

const schema = z.object({
    role: z.enum(["TENANT_ADMIN", "MEMBER"]),
});

export class UpdateMemberRoleDto {
    private constructor(
        public readonly role: MembershipRole,
    ) {}

    static create(body: unknown): [string[] | undefined, UpdateMemberRoleDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        return [undefined, new UpdateMemberRoleDto(result.data.role)];
    }
}
