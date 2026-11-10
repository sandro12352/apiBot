import { z } from "zod";
import type { MembershipRole } from "../entities/tenant.entity";

const schema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    role: z.enum(["TENANT_ADMIN", "MEMBER"]).default("MEMBER"),
});

export class AddMemberDto {
    private constructor(
        public readonly email: string,
        public readonly role: MembershipRole,
    ) {}

    static create(body: unknown): [string[] | undefined, AddMemberDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email, role } = result.data;
        return [undefined, new AddMemberDto(email, role)];
    }
}
