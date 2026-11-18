-- CreateTable
CREATE TABLE "catalog_images" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catalog_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "catalog_images_storageKey_key" ON "catalog_images"("storageKey");

-- CreateIndex
CREATE INDEX "catalog_images_tenantId_idx" ON "catalog_images"("tenantId");

-- CreateIndex
CREATE INDEX "catalog_images_itemId_position_idx" ON "catalog_images"("itemId", "position");

-- AddForeignKey
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_images" ADD CONSTRAINT "catalog_images_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
