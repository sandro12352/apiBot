import { z } from "zod";
import type { AIProviderName } from "../../config/adapters/ai-provider";

// "" y null limpian el campo opcional
const optionalText = (max: number) =>
    z
        .string()
        .trim()
        .max(max)
        .nullish()
        .transform((value) => (value ? value : null));

const schema = z.object({
    name: z.string().trim().min(1).max(100),
    instructions: z.string().trim().min(1).max(8000),
    language: z.string().trim().regex(/^[a-z]{2}(-[A-Za-z]{2})?$/, "must be a language code such as es or es-PE").default("es"),
    tone: optionalText(200),
    businessRules: optionalText(4000),
    aiProvider: z.enum(["OPENAI", "ANTHROPIC", "GEMINI"]).nullish().transform((value) => value ?? null),
    aiModel: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{1,100}$/, "invalid model id")
        .nullish()
        .transform((value) => value ?? null),
});

export class UpsertAssistantDto {
    private constructor(
        public readonly name: string,
        public readonly instructions: string,
        public readonly language: string,
        public readonly tone: string | null,
        public readonly businessRules: string | null,
        public readonly aiProvider: AIProviderName | null,
        public readonly aiModel: string | null,
    ) {}

    static create(body: unknown): [string[] | undefined, UpsertAssistantDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { name, instructions, language, tone, businessRules, aiProvider, aiModel } = result.data;
        return [undefined, new UpsertAssistantDto(name, instructions, language, tone, businessRules, aiProvider, aiModel)];
    }
}
