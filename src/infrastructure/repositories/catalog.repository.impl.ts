import type {
    CatalogDatasource,
    CatalogFilters,
    CatalogImageInfo,
    CatalogItemEntry,
    CatalogItemInput,
    CatalogItemUpdate,
    CatalogRepository,
    NewCatalogImage,
} from "../../domain";

export class CatalogRepositoryImpl implements CatalogRepository {
    constructor(private readonly datasource: CatalogDatasource) {}

    list(tenantId: string, filters: CatalogFilters): Promise<CatalogItemEntry[]> {
        return this.datasource.list(tenantId, filters);
    }

    count(tenantId: string): Promise<number> {
        return this.datasource.count(tenantId);
    }

    find(tenantId: string, id: string): Promise<CatalogItemEntry | null> {
        return this.datasource.find(tenantId, id);
    }

    create(tenantId: string, input: CatalogItemInput): Promise<CatalogItemEntry> {
        return this.datasource.create(tenantId, input);
    }

    update(tenantId: string, id: string, input: CatalogItemUpdate): Promise<CatalogItemEntry | null> {
        return this.datasource.update(tenantId, id, input);
    }

    remove(tenantId: string, id: string): Promise<string[] | null> {
        return this.datasource.remove(tenantId, id);
    }

    addImage(tenantId: string, itemId: string, image: NewCatalogImage, maxImages: number): Promise<CatalogImageInfo | null> {
        return this.datasource.addImage(tenantId, itemId, image, maxImages);
    }

    removeImage(tenantId: string, itemId: string, imageId: string): Promise<string | null> {
        return this.datasource.removeImage(tenantId, itemId, imageId);
    }

    searchActive(tenantId: string, text: string, limit: number): Promise<CatalogItemEntry[]> {
        return this.datasource.searchActive(tenantId, text, limit);
    }

    countActive(tenantId: string): Promise<number> {
        return this.datasource.countActive(tenantId);
    }

    listActive(tenantId: string, limit: number): Promise<CatalogItemEntry[]> {
        return this.datasource.listActive(tenantId, limit);
    }
}
