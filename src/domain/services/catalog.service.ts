import { randomUUID } from "node:crypto";
import type { FileStorage } from "../../config/adapters/file-storage";
import { detectImageType, IMAGE_EXTENSIONS } from "../../config/adapters/image-type";
import type { MediaUrlSigner } from "../../config/adapters/media-url-signer";
import type { CatalogFilters } from "../datasources/catalog.datasource";
import type { CreateCatalogItemDto, UpdateCatalogItemDto } from "../dtos/catalog-item.dto";
import { AuditAction, type AuditActionName } from "../entities/audit.entity";
import {
    CATALOG_IMAGE_MAX_BYTES,
    CATALOG_MAX_IMAGES_PER_ITEM,
    CATALOG_MAX_ITEMS,
    DuplicateSkuError,
    ImageLimitError,
    type CatalogItemEntry,
} from "../entities/catalog.entity";
import { CustomError } from "../errors/custom.error";
import type { CatalogRepository } from "../repositories/catalog.repository";
import type { AuditService } from "./audit.service";

// Enlaces de las imágenes para el panel: duran una hora
const PANEL_IMAGE_URL_TTL_SECONDS = 60 * 60;

export interface CatalogImageView {
    id: string;
    position: number;
    mimeType: string;
    sizeBytes: number;
    // Enlace firmado y temporal; null si el servidor no tiene URL pública configurada
    url: string | null;
}

export type CatalogItemView = Omit<CatalogItemEntry, "images"> & { images: CatalogImageView[] };

// Catálogo de UNA empresa. El tenantId sale de req.tenant (validado por el middleware).
// La clave interna del archivo nunca se expone: el panel recibe enlaces firmados.
export class CatalogService {

    constructor(
        private readonly repository: CatalogRepository,
        private readonly storage: FileStorage,
        private readonly mediaUrls: MediaUrlSigner,
        private readonly auditService: AuditService,
    ) {}

    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        if (error instanceof DuplicateSkuError) throw CustomError.conflict("SKU already in use in this company");
        if (error instanceof ImageLimitError) {
            throw CustomError.conflict(`A product can have at most ${CATALOG_MAX_IMAGES_PER_ITEM} images`);
        }
        console.error(`[CatalogService.${action}]`, error instanceof Error ? error.name : "error");
        throw CustomError.databaseError(`Database error on catalog ${action}`);
    }

    private audit(tenantId: string, actorUserId: string, action: AuditActionName, id: string) {
        return this.auditService.record({
            actorUserId,
            tenantId,
            action,
            resourceType: "catalog_item",
            resourceId: id,
            result: "SUCCESS",
        });
    }

    private toView(item: CatalogItemEntry): CatalogItemView {
        return {
            ...item,
            images: item.images.map(({ storageKey, ...image }) => ({
                ...image,
                url: this.mediaUrls.sign(storageKey, PANEL_IMAGE_URL_TTL_SECONDS),
            })),
        };
    }

    private async removeFiles(keys: string[]): Promise<void> {
        await Promise.all(
            keys.map((key) =>
                this.storage.remove(key).catch((error: unknown) => {
                    console.error("[CatalogService] file cleanup failed", error instanceof Error ? error.name : "error");
                }),
            ),
        );
    }

    async list(tenantId: string, filters: CatalogFilters): Promise<CatalogItemView[]> {
        try {
            return (await this.repository.list(tenantId, filters)).map((item) => this.toView(item));
        } catch (error) {
            this.handleError(error, "list");
        }
    }

    async get(tenantId: string, id: string): Promise<CatalogItemView> {
        try {
            const item = await this.repository.find(tenantId, id);
            if (!item) throw CustomError.notFound("Product not found");
            return this.toView(item);
        } catch (error) {
            this.handleError(error, "get");
        }
    }

    async create(tenantId: string, dto: CreateCatalogItemDto, actorUserId: string): Promise<CatalogItemView> {
        try {
            if ((await this.repository.count(tenantId)) >= CATALOG_MAX_ITEMS) {
                throw CustomError.conflict(`Catalog limit reached (${CATALOG_MAX_ITEMS} products)`);
            }
            const item = await this.repository.create(tenantId, dto.data);
            await this.audit(tenantId, actorUserId, AuditAction.CATALOG_CREATE, item.id);
            return this.toView(item);
        } catch (error) {
            this.handleError(error, "create");
        }
    }

    async update(tenantId: string, id: string, dto: UpdateCatalogItemDto, actorUserId: string): Promise<CatalogItemView> {
        try {
            const item = await this.repository.update(tenantId, id, dto.data);
            if (!item) throw CustomError.notFound("Product not found");
            await this.audit(tenantId, actorUserId, AuditAction.CATALOG_UPDATE, id);
            return this.toView(item);
        } catch (error) {
            this.handleError(error, "update");
        }
    }

    async remove(tenantId: string, id: string, actorUserId: string): Promise<void> {
        try {
            const keys = await this.repository.remove(tenantId, id);
            if (keys === null) throw CustomError.notFound("Product not found");
            await this.removeFiles(keys);
            await this.audit(tenantId, actorUserId, AuditAction.CATALOG_DELETE, id);
        } catch (error) {
            this.handleError(error, "remove");
        }
    }

    // El cuerpo de la petición es el archivo; se comprueba su tipo real, no solo la cabecera
    async addImage(
        tenantId: string,
        itemId: string,
        data: unknown,
        declaredType: string | undefined,
        actorUserId: string,
    ): Promise<CatalogItemView> {
        try {
            if (!Buffer.isBuffer(data) || data.length === 0) {
                throw CustomError.badRequest("Send the image as the request body with Content-Type image/jpeg, image/png or image/webp");
            }
            if (data.length > CATALOG_IMAGE_MAX_BYTES) throw new CustomError(413, "Image larger than 5 MB");

            const mimeType = detectImageType(data);
            if (!mimeType) throw CustomError.badRequest("Only JPEG, PNG or WebP images are allowed");
            if (declaredType && declaredType.split(";")[0]!.trim().toLowerCase() !== mimeType) {
                throw CustomError.badRequest("Content-Type does not match the file");
            }

            const item = await this.repository.find(tenantId, itemId);
            if (!item) throw CustomError.notFound("Product not found");
            if (item.images.length >= CATALOG_MAX_IMAGES_PER_ITEM) throw new ImageLimitError();

            const storageKey = `${tenantId}/catalog/${itemId}/${randomUUID()}.${IMAGE_EXTENSIONS[mimeType]}`;
            await this.storage.save(storageKey, data);
            try {
                const image = await this.repository.addImage(
                    tenantId,
                    itemId,
                    { storageKey, mimeType, sizeBytes: data.length },
                    CATALOG_MAX_IMAGES_PER_ITEM,
                );
                if (!image) throw CustomError.notFound("Product not found");
            } catch (error) {
                // El registro falló: no se deja el archivo huérfano
                await this.removeFiles([storageKey]);
                throw error;
            }

            await this.audit(tenantId, actorUserId, AuditAction.CATALOG_IMAGE_ADD, itemId);
            return this.get(tenantId, itemId);
        } catch (error) {
            this.handleError(error, "addImage");
        }
    }

    async removeImage(tenantId: string, itemId: string, imageId: string, actorUserId: string): Promise<void> {
        try {
            const key = await this.repository.removeImage(tenantId, itemId, imageId);
            if (key === null) throw CustomError.notFound("Image not found");
            await this.removeFiles([key]);
            await this.audit(tenantId, actorUserId, AuditAction.CATALOG_IMAGE_DELETE, itemId);
        } catch (error) {
            this.handleError(error, "removeImage");
        }
    }
}
