import { z } from "zod";

const createUserSchema = z.object({
    email: z.email().transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(72),
    acceptPrivacy: z.literal(true),
    acceptTerms: z.literal(true),
});

export class CreateUserDto {
    private constructor(
        public readonly email: string,
        public readonly password: string,
        public readonly acceptPrivacy: true,
        public readonly acceptTerms: true,
    ) {}

    static create(body: unknown): [string[] | undefined, CreateUserDto | undefined] {
        const result = createUserSchema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { email, password, acceptPrivacy, acceptTerms } = result.data;
        return [undefined, new CreateUserDto(email, password, acceptPrivacy, acceptTerms)];
    }
}
