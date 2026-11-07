import { z } from "zod";

// Por ahora solo el nombre; la configuración del bot llega con /assistants
const schema = z.object({
    name: z.string().trim().min(2).max(100),
}).strict();

export class UpdateTenantDto {
    private constructor(
        public readonly name: string,
    ) {}

    static create(body: unknown): [string[] | undefined, UpdateTenantDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        return [undefined, new UpdateTenantDto(result.data.name)];
    }
}
