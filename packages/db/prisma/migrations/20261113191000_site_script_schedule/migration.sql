-- AlterTable
ALTER TABLE "SiteScript" ADD COLUMN     "cron" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "nextRunAt" TIMESTAMP(3),
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';

-- CreateIndex
CREATE INDEX "SiteScript_enabled_nextRunAt_idx" ON "SiteScript"("enabled", "nextRunAt");
