import { z } from "zod";

const schema = z.object({
    refreshToken: z.string().regex(/^[a-f0-9]{64}$/),
});

export class RefreshTokenDto {
    private constructor(
        public readonly refreshToken: string,
    ) {}

    static create(body: unknown): [string[] | undefined, RefreshTokenDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        return [undefined, new RefreshTokenDto(result.data.refreshToken)];
    }
}
