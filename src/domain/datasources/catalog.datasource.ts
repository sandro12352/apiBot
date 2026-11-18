import type {
    CatalogImageInfo,
    CatalogItemEntry,
    CatalogItemInput,
    CatalogItemStatus,
    CatalogItemUpdate,
    NewCatalogImage,
} from "../entities/catalog.entity";

export interface CatalogFilters {
    status?: CatalogItemStatus | undefined;
    category?: string | undefined;
}

// Toda operación va filtrada por tenantId: una empresa nunca ve ni toca productos de otra.
export abstract class CatalogDatasource {
    abstract list(tenantId: string, filters: CatalogFilters): Promise<CatalogItemEntry[]>;
    abstract count(tenantId: string): Promise<number>;
    abstract find(tenantId: string, id: string): Promise<CatalogItemEntry | null>;
    // Lanza DuplicateSkuError si el SKU ya existe en la empresa
    abstract create(tenantId: string, input: CatalogItemInput): Promise<CatalogItemEntry>;
    abstract update(tenantId: string, id: string, input: CatalogItemUpdate): Promise<CatalogItemEntry | null>;
    // Devuelve las claves de sus imágenes (para borrar los archivos) o null si no existía
    abstract remove(tenantId: string, id: string): Promise<string[] | null>;

    // Lanza ImageLimitError si el producto ya tiene el máximo; null si el producto no existe
    abstract addImage(tenantId: string, itemId: string, image: NewCatalogImage, maxImages: number): Promise<CatalogImageInfo | null>;
    // Devuelve la clave del archivo borrado o null si no existía
    abstract removeImage(tenantId: string, itemId: string, imageId: string): Promise<string | null>;

    // Para el bot: productos activos relacionados con el texto, del más al menos relevante
    abstract searchActive(tenantId: string, text: string, limit: number): Promise<CatalogItemEntry[]>;
    abstract countActive(tenantId: string): Promise<number>;
    abstract listActive(tenantId: string, limit: number): Promise<CatalogItemEntry[]>;
}
