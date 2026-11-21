-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "fields" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountForm" (
    "id" TEXT NOT NULL,
    "wechatAccountId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountForm_wechatAccountId_idx" ON "AccountForm"("wechatAccountId");

-- CreateIndex
CREATE INDEX "AccountForm_templateId_idx" ON "AccountForm"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountForm_wechatAccountId_templateId_key" ON "AccountForm"("wechatAccountId", "templateId");

-- AddForeignKey
ALTER TABLE "AccountForm" ADD CONSTRAINT "AccountForm_wechatAccountId_fkey" FOREIGN KEY ("wechatAccountId") REFERENCES "WechatAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountForm" ADD CONSTRAINT "AccountForm_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
