CREATE TABLE "YybRequestLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'api',
    "method" TEXT NOT NULL DEFAULT 'POST',
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "wechatAccountId" TEXT,
    "wechatAccountName" TEXT,
    "siteId" TEXT,
    "siteName" TEXT,
    "siteAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "YybRequestLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "YybRequestLog_createdAt_idx" ON "YybRequestLog"("createdAt");
CREATE INDEX "YybRequestLog_type_idx" ON "YybRequestLog"("type");
CREATE INDEX "YybRequestLog_status_idx" ON "YybRequestLog"("status");
CREATE INDEX "YybRequestLog_wechatAccountId_idx" ON "YybRequestLog"("wechatAccountId");
CREATE INDEX "YybRequestLog_siteId_idx" ON "YybRequestLog"("siteId");
