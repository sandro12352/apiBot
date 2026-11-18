import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../data/postgres";
import {
    CatalogDatasource,
    DuplicateSkuError,
    ImageLimitError,
    type CatalogAttributes,
    type CatalogFilters,
    type CatalogImageInfo,
    type CatalogItemEntry,
    type CatalogItemInput,
    type CatalogItemStatus,
    type CatalogItemUpdate,
    type NewCatalogImage,
} from "../../domain";

const withImages = { images: { orderBy: { position: "asc" } } } as const;

type ItemRow = Prisma.CatalogItemGetPayload<{ include: typeof withImages }>;
type ImageRow = ItemRow["images"][number];

const toImage = (row: ImageRow): CatalogImageInfo => ({
    id: row.id,
    position: row.position,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
});

const toEntry = (row: ItemRow): CatalogItemEntry => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    price: row.price.toFixed(2),
    currency: row.currency,
    category: row.category,
    attributes: (row.attributes as CatalogAttributes | null) ?? null,
    status: row.status as CatalogItemStatus,
    images: row.images.map(toImage),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

// Json nulo en Prisma: null de base de datos, no el valor JSON "null"
const toData = (input: CatalogItemUpdate) => {
    const { attributes, ...rest } = input;
    return {
        ...rest,
        ...(attributes !== undefined ? { attributes: attributes === null ? Prisma.DbNull : attributes } : {}),
    };
};

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === "P2002";

export class CatalogDatasourceImpl extends CatalogDatasource {

    async list(tenantId: string, filters: CatalogFilters): Promise<CatalogItemEntry[]> {
        const rows = await prisma.catalogItem.findMany({
            where: {
                tenantId,
                ...(filters.status ? { status: filters.status } : {}),
                ...(filters.category ? { category: filters.category } : {}),
            },
            orderBy: { createdAt: "desc" },
            include: withImages,
        });
        return rows.map(toEntry);
    }

    count(tenantId: string): Promise<number> {
        return prisma.catalogItem.count({ where: { tenantId } });
    }

    async find(tenantId: string, id: string): Promise<CatalogItemEntry | null> {
        const row = await prisma.catalogItem.findFirst({ where: { id, tenantId }, include: withImages });
        return row ? toEntry(row) : null;
    }

    async create(tenantId: string, input: CatalogItemInput): Promise<CatalogItemEntry> {
        try {
            const row = await prisma.catalogItem.create({
                data: { tenantId, ...toData(input), name: input.name, price: input.price, currency: input.currency },
                include: withImages,
            });
            return toEntry(row);
        } catch (error) {
            if (isUniqueViolation(error)) throw new DuplicateSkuError();
            throw error;
        }
    }

    async update(tenantId: string, id: string, input: CatalogItemUpdate): Promise<CatalogItemEntry | null> {
        const existing = await prisma.catalogItem.findFirst({ where: { id, tenantId }, select: { id: true } });
        if (!existing) return null;
        try {
            const row = await prisma.catalogItem.update({ where: { id }, data: toData(input), include: withImages });
            return toEntry(row);
        } catch (error) {
            if (isUniqueViolation(error)) throw new DuplicateSkuError();
            throw error;
        }
    }

    async remove(tenantId: string, id: string): Promise<string[] | null> {
        return prisma.$transaction(async (tx) => {
            const item = await tx.catalogItem.findFirst({
                where: { id, tenantId },
                select: { id: true, images: { select: { storageKey: true } } },
            });
            if (!item) return null;
            // Las imágenes se borran en cascada; se devuelven sus claves para borrar los archivos
            await tx.catalogItem.delete({ where: { id: item.id } });
            return item.images.map((image) => image.storageKey);
        });
    }

    async addImage(tenantId: string, itemId: string, image: NewCatalogImage, maxImages: number): Promise<CatalogImageInfo | null> {
        return prisma.$transaction(async (tx) => {
            const item = await tx.catalogItem.findFirst({ where: { id: itemId, tenantId }, select: { id: true } });
            if (!item) return null;

            const current = await tx.catalogImage.findMany({
                where: { itemId },
                orderBy: { position: "desc" },
                select: { position: true },
            });
            if (current.length >= maxImages) throw new ImageLimitError();

            const row = await tx.catalogImage.create({
                data: { tenantId, itemId, ...image, position: (current[0]?.position ?? -1) + 1 },
            });
            return toImage(row);
        });
    }

    async removeImage(tenantId: string, itemId: string, imageId: string): Promise<string | null> {
        const image = await prisma.catalogImage.findFirst({
            where: { id: imageId, itemId, tenantId },
            select: { id: true, storageKey: true },
        });
        if (!image) return null;
        await prisma.catalogImage.delete({ where: { id: image.id } });
        return image.storageKey;
    }

    // Misma búsqueda en español que la base de conocimiento: basta una palabra en común y se ordena
    // por relevancia. Se busca en nombre, SKU, categoría, descripción y atributos.
    async searchActive(tenantId: string, text: string, limit: number): Promise<CatalogItemEntry[]> {
        if (!text.trim()) return [];

        const matches = await prisma.$queryRaw<{ id: string }[]>`
            WITH query AS (
                SELECT to_tsquery('simple', COALESCE(string_agg(quote_literal(lexeme), ' | '), '')) AS q
                FROM unnest(tsvector_to_array(to_tsvector('spanish', lower(${text})))) AS lexeme
            ), docs AS (
                SELECT c.id, c."updatedAt",
                       to_tsvector('spanish', lower(
                           c.name || ' ' || COALESCE(c.sku, '') || ' ' || COALESCE(c.category, '') || ' ' ||
                           COALESCE(c.description, '') || ' ' || COALESCE(c.attributes::text, '')
                       )) AS doc
                FROM catalog_items c
                WHERE c."tenantId" = ${tenantId} AND c.status::text = 'ACTIVE'
            )
            SELECT docs.id
            FROM docs, query
            WHERE docs.doc @@ query.q
            ORDER BY ts_rank(docs.doc, query.q) DESC, docs."updatedAt" DESC
            LIMIT ${limit}`;
        if (matches.length === 0) return [];

        const rows = await prisma.catalogItem.findMany({
            where: { id: { in: matches.map((match) => match.id) }, tenantId },
            include: withImages,
        });
        // Se respeta el orden de relevancia de la búsqueda
        const byId = new Map(rows.map((row) => [row.id, row]));
        return matches.flatMap((match) => {
            const row = byId.get(match.id);
            return row ? [toEntry(row)] : [];
        });
    }

    countActive(tenantId: string): Promise<number> {
        return prisma.catalogItem.count({ where: { tenantId, status: "ACTIVE" } });
    }

    async listActive(tenantId: string, limit: number): Promise<CatalogItemEntry[]> {
        const rows = await prisma.catalogItem.findMany({
            where: { tenantId, status: "ACTIVE" },
            orderBy: { updatedAt: "desc" },
            take: limit,
            include: withImages,
        });
        return rows.map(toEntry);
    }
}
