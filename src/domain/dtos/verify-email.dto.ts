import { z } from "zod";

const schema = z.object({
    token: z.string().min(1).max(256),
});

export class VerifyEmailDto {
    private constructor(
        public readonly token: string,
    ) {}

    static create(body: unknown): [string[] | undefined, VerifyEmailDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { token } = result.data;
        return [undefined, new VerifyEmailDto(token)];
    }
}
