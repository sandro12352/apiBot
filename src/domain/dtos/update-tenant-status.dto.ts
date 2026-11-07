import { z } from "zod";

const schema = z.object({
    status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
});

export class UpdateTenantStatusDto {
    private constructor(
        public readonly status: "ACTIVE" | "SUSPENDED" | "CANCELLED",
    ) {}

    static create(body: unknown): [string[] | undefined, UpdateTenantStatusDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        return [undefined, new UpdateTenantStatusDto(result.data.status)];
    }
}
