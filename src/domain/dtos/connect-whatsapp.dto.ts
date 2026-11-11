import { z } from "zod";

// Los ids de Meta son numéricos
const metaId = z.string().trim().regex(/^\d{5,30}$/, "must be a numeric Meta id");

const schema = z.object({
    phoneNumberId: metaId,
    wabaId: metaId,
    // Sin espacios: un token con espacios o saltos de línea es un pegado erróneo
    accessToken: z.string().trim().min(20).max(2000).regex(/^\S+$/, "must not contain whitespace"),
});

export class ConnectWhatsappDto {
    private constructor(
        public readonly phoneNumberId: string,
        public readonly wabaId: string,
        public readonly accessToken: string,
    ) {}

    static create(body: unknown): [string[] | undefined, ConnectWhatsappDto | undefined] {
        const result = schema.safeParse(body);

        if (!result.success) {
            // Solo ruta y mensaje: nunca el valor recibido (podría ser un token)
            const errors = result.error.issues.map(
                (issue) => `${issue.path.join(".")}: ${issue.message}`,
            );
            return [errors, undefined];
        }

        const { phoneNumberId, wabaId, accessToken } = result.data;
        return [undefined, new ConnectWhatsappDto(phoneNumberId, wabaId, accessToken)];
    }
}
