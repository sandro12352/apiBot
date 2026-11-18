import type { CatalogFilters } from "../datasources/catalog.datasource";
import type {
    CatalogImageInfo,
    CatalogItemEntry,
    CatalogItemInput,
    CatalogItemUpdate,
    NewCatalogImage,
} from "../entities/catalog.entity";

export abstract class CatalogRepository {
    abstract list(tenantId: string, filters: CatalogFilters): Promise<CatalogItemEntry[]>;
    abstract count(tenantId: string): Promise<number>;
    abstract find(tenantId: string, id: string): Promise<CatalogItemEntry | null>;
    abstract create(tenantId: string, input: CatalogItemInput): Promise<CatalogItemEntry>;
    abstract update(tenantId: string, id: string, input: CatalogItemUpdate): Promise<CatalogItemEntry | null>;
    abstract remove(tenantId: string, id: string): Promise<string[] | null>;
    abstract addImage(tenantId: string, itemId: string, image: NewCatalogImage, maxImages: number): Promise<CatalogImageInfo | null>;
    abstract removeImage(tenantId: string, itemId: string, imageId: string): Promise<string | null>;
    abstract searchActive(tenantId: string, text: string, limit: number): Promise<CatalogItemEntry[]>;
    abstract countActive(tenantId: string): Promise<number>;
    abstract listActive(tenantId: string, limit: number): Promise<CatalogItemEntry[]>;
}
