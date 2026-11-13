import { z } from "zod";

const schema = z.object({
    // Sin espacios: un pegado con saltos de línea o texto extra es un error de copia
    apiKey: z.string().trim().min(20).max(500).regex(/^\S+$/, "must not contain whitespace"),
    preferredModel: z.string().trim().regex(/^[A-Za-z0-9._-]{1,100}$/, "invalid model id").optional(),
});

export class SaveAiCredentialDto {
    private constructor(
        public readonly apiKey: string,
        public readonly preferredModel: string | undefined,
    ) {}

    static create(body: unknown): [string[] | undefined, SaveAiCredentialDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            // Solo ruta y mensaje: nunca el valor recibido (es una clave)
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { apiKey, preferredModel } = result.data;
        return [undefined, new SaveAiCredentialDto(apiKey, preferredModel)];
    }
}
