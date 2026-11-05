import { z } from "zod";

const updateUserSchema = z
    .object({
        email: z.email().transform((value) => value.toLowerCase()).optional(),
        password: z.string().min(8).max(72).optional(),
    })
    .refine((data) => data.email !== undefined || data.password !== undefined, {
        message: "Debes enviar al menos email o password",
    });

export class UpdateUserDto {
    private constructor(
        public readonly email?: string,
        public readonly password?: string,
    ) {}

    static create(body: unknown): [string[] | undefined, UpdateUserDto | undefined] {
        const result = updateUserSchema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email, password } = result.data;
        return [undefined, new UpdateUserDto(email, password)];
    }
}
