-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "sourceAppKey" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "SourceApp" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'wechat_miniprogram',
    "description" TEXT NOT NULL DEFAULT '',
    "iconUrl" TEXT,
    "pointsName" TEXT NOT NULL DEFAULT '积分',
    "category" TEXT NOT NULL DEFAULT '',
    "version" TEXT NOT NULL DEFAULT '',
    "manifest" JSONB NOT NULL,
    "scriptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceApp_name_idx" ON "SourceApp"("name");

-- CreateIndex
CREATE INDEX "SourceApp_updatedAt_idx" ON "SourceApp"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SourceApp_sourceId_key_key" ON "SourceApp"("sourceId", "key");

-- CreateIndex
CREATE INDEX "Site_sourceId_idx" ON "Site"("sourceId");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScriptSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceApp" ADD CONSTRAINT "SourceApp_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScriptSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
