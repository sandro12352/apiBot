import { z } from "zod";

const schema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
});

export class ForgotPasswordDto {
    private constructor(
        public readonly email: string,
    ) {}

    static create(body: unknown): [string[] | undefined, ForgotPasswordDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email } = result.data;
        return [undefined, new ForgotPasswordDto(email)];
    }
}
