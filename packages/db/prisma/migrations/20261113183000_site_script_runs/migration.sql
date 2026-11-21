-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "siteAccountId" TEXT,
ADD COLUMN     "siteId" TEXT,
ADD COLUMN     "siteScriptId" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Run_siteScriptId_createdAt_idx" ON "Run"("siteScriptId", "createdAt");

-- CreateIndex
CREATE INDEX "Run_siteId_createdAt_idx" ON "Run"("siteId", "createdAt");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_siteScriptId_fkey" FOREIGN KEY ("siteScriptId") REFERENCES "SiteScript"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_siteAccountId_fkey" FOREIGN KEY ("siteAccountId") REFERENCES "SiteAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
