-- CreateTable
CREATE TABLE "SiteScript" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "filePath" TEXT NOT NULL,
    "args" TEXT NOT NULL DEFAULT '',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteScript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteScript_siteId_idx" ON "SiteScript"("siteId");

-- AddForeignKey
ALTER TABLE "SiteScript" ADD CONSTRAINT "SiteScript_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
