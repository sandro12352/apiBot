import { z } from "zod";

const schema = z.object({
    token: z.string().min(1).max(256),
    password: z.string().min(8).max(72),
    // Solo se exige cuando la cuenta la creó un administrador y aún no se aceptaron
    acceptPrivacy: z.literal(true).optional(),
    acceptTerms: z.literal(true).optional(),
});

export class ResetPasswordDto {
    private constructor(
        public readonly token: string,
        public readonly password: string,
        public readonly acceptedTerms: boolean,
    ) {}

    static create(body: unknown): [string[] | undefined, ResetPasswordDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { token, password, acceptPrivacy, acceptTerms } = result.data;
        return [
            undefined,
            new ResetPasswordDto(token, password, acceptPrivacy === true && acceptTerms === true),
        ];
    }
}
