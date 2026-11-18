import { z } from "zod";
import { KNOWLEDGE_CONTENT_MAX, KNOWLEDGE_TITLE_MAX, type KnowledgeType } from "../entities/knowledge.entity";

// Texto con el formato que entiende WhatsApp (*negrita*, _cursiva_, listas, saltos de línea).
// Los mensajes de error nunca incluyen el valor recibido.
const schema = z.object({
    type: z.enum(["FAQ", "TEXT"]),
    title: z.string().trim().min(1).max(KNOWLEDGE_TITLE_MAX),
    content: z.string().trim().min(1).max(KNOWLEDGE_CONTENT_MAX),
    isActive: z.boolean().default(true),
}).strict();

export class CreateKnowledgeDto {
    private constructor(
        public readonly type: KnowledgeType,
        public readonly title: string,
        public readonly content: string,
        public readonly isActive: boolean,
    ) {}

    static create(body: unknown): [string[] | undefined, CreateKnowledgeDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { type, title, content, isActive } = result.data;
        return [undefined, new CreateKnowledgeDto(type, title, content, isActive)];
    }
}
