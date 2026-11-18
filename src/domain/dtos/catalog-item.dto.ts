import { z } from "zod";
import type { CatalogAttributes, CatalogItemInput, CatalogItemStatus, CatalogItemUpdate } from "../entities/catalog.entity";

// "" y null limpian los campos opcionales de texto
const optionalText = (max: number) =>
    z.string().trim().max(max).nullish().transform((value) => (value ? value : null));

const fields = {
    sku: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._-]{1,64}$/, "must be 1-64 letters, numbers, dots, dashes or underscores")
        .nullish()
        .transform((value) => value ?? null),
    name: z.string().trim().min(1).max(200),
    description: optionalText(2000),
    // Precio con hasta 2 decimales
    price: z
        .number()
        .min(0)
        .max(99_999_999.99)
        .refine((value) => Math.round(value * 100) === Number((value * 100).toFixed(6)), "must have at most 2 decimals"),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "must be an ISO code such as PEN or USD"),
    category: optionalText(100),
    // Ej.: { "color": "negro", "capacidad": "256GB" }
    attributes: z
        .record(z.string().trim().min(1).max(50), z.union([z.string().trim().max(200), z.number(), z.boolean()]))
        .refine((value) => Object.keys(value).length <= 20, "at most 20 attributes")
        .nullish()
        .transform((value) => (value && Object.keys(value).length > 0 ? (value as CatalogAttributes) : null)),
    status: z.enum(["ACTIVE", "INACTIVE"]),
};

const createSchema = z
    .object({
        ...fields,
        currency: fields.currency.default("PEN"),
        status: fields.status.default("ACTIVE"),
    })
    .strict();

const updateSchema = z
    .object({
        sku: fields.sku.optional(),
        name: fields.name.optional(),
        description: fields.description.optional(),
        price: fields.price.optional(),
        currency: fields.currency.optional(),
        category: fields.category.optional(),
        attributes: fields.attributes.optional(),
        status: fields.status.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, { message: "Send at least one field" });

const issues = (error: z.ZodError) => error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);

export class CreateCatalogItemDto {
    private constructor(public readonly data: CatalogItemInput) {}

    static create(body: unknown): [string[] | undefined, CreateCatalogItemDto | undefined] {
        const result = createSchema.safeParse(body);
        if (!result.success) return [issues(result.error), undefined];
        return [undefined, new CreateCatalogItemDto({ ...result.data, status: result.data.status as CatalogItemStatus })];
    }
}

export class UpdateCatalogItemDto {
    private constructor(public readonly data: CatalogItemUpdate) {}

    static create(body: unknown): [string[] | undefined, UpdateCatalogItemDto | undefined] {
        // Las claves enviadas con undefined no cuentan como cambio
        const result = updateSchema.safeParse(body);
        if (!result.success) return [issues(result.error), undefined];

        const data = Object.fromEntries(
            Object.entries(result.data).filter(([key]) => body && typeof body === "object" && key in body),
        ) as CatalogItemUpdate;
        return [undefined, new UpdateCatalogItemDto(data)];
    }
}
