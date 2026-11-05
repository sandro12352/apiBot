import { z } from "zod";

const loginSchema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(72),
});

export class LoginDto {
    private constructor(
        public readonly email: string,
        public readonly password: string,
    ) {}

    static create(body: unknown): [string[] | undefined, LoginDto | undefined] {
        const result = loginSchema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email, password } = result.data;
        return [undefined, new LoginDto(email, password)];
    }
}
