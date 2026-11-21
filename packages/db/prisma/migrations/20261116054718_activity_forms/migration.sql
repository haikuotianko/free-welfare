-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "formSchema" JSONB,
ADD COLUMN     "scriptId" TEXT;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "input" JSONB;

-- CreateIndex
CREATE INDEX "Activity_scriptId_idx" ON "Activity"("scriptId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "SiteScript"("id") ON DELETE SET NULL ON UPDATE CASCADE;
