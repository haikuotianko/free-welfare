-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WechatAccount" (
    "id" TEXT NOT NULL,
    "yybRef" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "remark" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "scanProduct" TEXT,
    "openidMasked" TEXT,
    "avatarUrl" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WechatAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'wechat_miniprogram',
    "appId" TEXT NOT NULL,
    "iconUrl" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "networkMode" TEXT NOT NULL DEFAULT 'whitelist',
    "rootUrls" JSONB NOT NULL DEFAULT '[]',
    "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "networkNotes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAccount" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "wechatAccountId" TEXT NOT NULL,
    "businessUserId" TEXT,
    "nickname" TEXT,
    "sessionEnc" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "lastError" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointAccount" (
    "id" TEXT NOT NULL,
    "siteAccountId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'points',
    "expiringAmount" INTEGER NOT NULL DEFAULT 0,
    "nextExpiryAt" TIMESTAMP(3),
    "rulesText" TEXT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "raw" JSONB,

    CONSTRAINT "PointAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointLot" (
    "id" TEXT NOT NULL,
    "pointAccountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "sourceRef" TEXT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL,
    "pointAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "description" TEXT,
    "raw" JSONB,

    CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "cashCost" DECIMAL(10,2),
    "stock" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'on_sale',
    "limitPerUser" INTEGER,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "points" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'available',
    "progressCurrent" INTEGER,
    "progressTarget" INTEGER,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "action" TEXT NOT NULL DEFAULT 'none',
    "raw" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "indexUrl" TEXT NOT NULL,
    "trustLevel" TEXT NOT NULL DEFAULT 'official',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'action',
    "capability" TEXT,
    "runtime" TEXT NOT NULL DEFAULT 'node',
    "commonVersion" TEXT,
    "currentVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "sourceId" TEXT,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "bundlePath" TEXT,
    "bundleHash" TEXT,
    "bundleSize" INTEGER,
    "depsHash" TEXT,
    "sdkVersion" TEXT,
    "commonVersion" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'reviewed',
    "changelog" TEXT,
    "minPlatformVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Binding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "siteAccountId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "configEnc" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Binding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "bindingId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "configEnc" JSONB,
    "cron" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "runAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "scriptVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "exitCode" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "summary" JSONB,
    "logPath" TEXT,
    "artifactPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "data" JSONB,

    CONSTRAINT "RunLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_adminId_idx" ON "Session"("adminId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WechatAccount_yybRef_key" ON "WechatAccount"("yybRef");

-- CreateIndex
CREATE UNIQUE INDEX "Site_key_key" ON "Site"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Site_platform_appId_key" ON "Site"("platform", "appId");

-- CreateIndex
CREATE INDEX "SiteAccount_siteId_idx" ON "SiteAccount"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteAccount_siteId_wechatAccountId_key" ON "SiteAccount"("siteId", "wechatAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PointAccount_siteAccountId_key" ON "PointAccount"("siteAccountId");

-- CreateIndex
CREATE INDEX "PointLot_pointAccountId_expiresAt_idx" ON "PointLot"("pointAccountId", "expiresAt");

-- CreateIndex
CREATE INDEX "PointTransaction_pointAccountId_occurredAt_idx" ON "PointTransaction"("pointAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "Product_siteId_status_idx" ON "Product"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Product_siteId_externalId_key" ON "Product"("siteId", "externalId");

-- CreateIndex
CREATE INDEX "Activity_siteId_status_idx" ON "Activity"("siteId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_siteId_externalId_key" ON "Activity"("siteId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Script_key_key" ON "Script"("key");

-- CreateIndex
CREATE INDEX "ScriptVersion_scriptId_idx" ON "ScriptVersion"("scriptId");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptVersion_scriptId_version_bundleHash_key" ON "ScriptVersion"("scriptId", "version", "bundleHash");

-- CreateIndex
CREATE INDEX "Binding_siteId_idx" ON "Binding"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "Binding_siteId_siteAccountId_scriptId_key" ON "Binding"("siteId", "siteAccountId", "scriptId");

-- CreateIndex
CREATE INDEX "Task_enabled_nextRunAt_idx" ON "Task"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Task_bindingId_idx" ON "Task"("bindingId");

-- CreateIndex
CREATE INDEX "Run_status_createdAt_idx" ON "Run"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Run_taskId_createdAt_idx" ON "Run"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "RunLog_runId_ts_idx" ON "RunLog"("runId", "ts");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAccount" ADD CONSTRAINT "SiteAccount_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAccount" ADD CONSTRAINT "SiteAccount_wechatAccountId_fkey" FOREIGN KEY ("wechatAccountId") REFERENCES "WechatAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointAccount" ADD CONSTRAINT "PointAccount_siteAccountId_fkey" FOREIGN KEY ("siteAccountId") REFERENCES "SiteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointLot" ADD CONSTRAINT "PointLot_pointAccountId_fkey" FOREIGN KEY ("pointAccountId") REFERENCES "PointAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointTransaction" ADD CONSTRAINT "PointTransaction_pointAccountId_fkey" FOREIGN KEY ("pointAccountId") REFERENCES "PointAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ScriptSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_siteAccountId_fkey" FOREIGN KEY ("siteAccountId") REFERENCES "SiteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Binding" ADD CONSTRAINT "Binding_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_bindingId_fkey" FOREIGN KEY ("bindingId") REFERENCES "Binding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_scriptVersionId_fkey" FOREIGN KEY ("scriptVersionId") REFERENCES "ScriptVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunLog" ADD CONSTRAINT "RunLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

