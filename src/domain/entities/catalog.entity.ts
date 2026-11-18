// Catálogo de productos de una empresa. Los precios y datos que ve el cliente salen de aquí,
// nunca de lo que "recuerde" la IA.
export type CatalogItemStatus = "ACTIVE" | "INACTIVE";
export type CatalogAttributes = Record<string, string | number | boolean>;

export const CATALOG_MAX_ITEMS = 2000;
export const CATALOG_MAX_IMAGES_PER_ITEM = 5;
export const CATALOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
// Imágenes que el bot envía como máximo en una respuesta, sumando todos los productos
export const MAX_IMAGES_PER_REPLY = 3;

export interface CatalogImageInfo {
    id: string;
    position: number;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
}

export interface CatalogItemEntry {
    id: string;
    sku: string | null;
    name: string;
    description: string | null;
    // Decimal con 2 cifras, como texto para no perder precisión ("4569.00")
    price: string;
    currency: string;
    category: string | null;
    attributes: CatalogAttributes | null;
    status: CatalogItemStatus;
    images: CatalogImageInfo[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CatalogItemInput {
    sku: string | null;
    name: string;
    description: string | null;
    price: number;
    currency: string;
    category: string | null;
    attributes: CatalogAttributes | null;
    status: CatalogItemStatus;
}

export type CatalogItemUpdate = Partial<CatalogItemInput>;

export interface NewCatalogImage {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
}

// El SKU ya lo usa otro producto de la misma empresa
export class DuplicateSkuError extends Error {
    constructor() {
        super("SKU already in use");
        this.name = "DuplicateSkuError";
    }
}

// Se alcanzó el máximo de imágenes del producto
export class ImageLimitError extends Error {
    constructor() {
        super("Image limit reached");
        this.name = "ImageLimitError";
    }
}
