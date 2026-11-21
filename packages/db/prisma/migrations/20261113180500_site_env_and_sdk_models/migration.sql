-- DropIndex
DROP INDEX "Product_siteId_externalId_key";

-- DropIndex
DROP INDEX "Product_siteId_status_idx";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'product';

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "scriptMode" TEXT NOT NULL DEFAULT 'platform';

-- CreateTable
CREATE TABLE "SiteEnvVar" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteEnvVar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "siteAccountId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "externalId" TEXT,
    "productExternalId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "pointsCost" INTEGER,
    "cashCost" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteEnvVar_siteId_idx" ON "SiteEnvVar"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteEnvVar_siteId_key_key" ON "SiteEnvVar"("siteId", "key");

-- CreateIndex
CREATE INDEX "Order_siteId_createdAt_idx" ON "Order"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_siteAccountId_createdAt_idx" ON "Order"("siteAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_siteId_siteAccountId_externalId_key" ON "Order"("siteId", "siteAccountId", "externalId");

-- CreateIndex
CREATE INDEX "Product_siteId_kind_status_idx" ON "Product"("siteId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_siteId_kind_externalId_key" ON "Product"("siteId", "kind", "externalId");

-- AddForeignKey
ALTER TABLE "SiteEnvVar" ADD CONSTRAINT "SiteEnvVar_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_siteAccountId_fkey" FOREIGN KEY ("siteAccountId") REFERENCES "SiteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
