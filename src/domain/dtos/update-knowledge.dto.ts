import { z } from "zod";
import { KNOWLEDGE_CONTENT_MAX, KNOWLEDGE_TITLE_MAX } from "../entities/knowledge.entity";

// El tipo (FAQ/TEXT) no se cambia: para eso se borra y se crea otra entrada
const schema = z
    .object({
        title: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX).optional(),
        content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_MAX).optional(),
        isActive: z.boolean().optional(),
    })
    .strict()
    .refine((data) => data.title !== undefined || data.content !== undefined || data.isActive !== undefined, {
        message: "Send at least title, content or isActive",
    });

export class UpdateKnowledgeDto {
    private constructor(
        public readonly title: string | undefined,
        public readonly content: string | undefined,
        public readonly isActive: boolean | undefined,
    ) {}

    static create(body: unknown): [string[] | undefined, UpdateKnowledgeDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { title, content, isActive } = result.data;
        return [undefined, new UpdateKnowledgeDto(title, content, isActive)];
    }
}
