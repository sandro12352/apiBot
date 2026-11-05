import { z } from "zod";

const schema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    tenantName: z.string().trim().min(2).max(100),
});

// Alta manual de un cliente (tras el pago): usuario + empresa
export class CreateClientDto {
    private constructor(
        public readonly email: string,
        public readonly tenantName: string,
    ) {}

    static create(body: unknown): [string[] | undefined, CreateClientDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email, tenantName } = result.data;
        return [undefined, new CreateClientDto(email, tenantName)];
    }
}
