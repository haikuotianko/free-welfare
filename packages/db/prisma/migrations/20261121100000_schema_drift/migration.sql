-- Idempotent catch-up for databases created before the schema was fully captured in migrations.
ALTER TABLE "Run" ADD COLUMN IF NOT EXISTS "notBefore" TIMESTAMP(3);

ALTER TABLE "Site" ADD COLUMN IF NOT EXISTS "registrationMode" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS "registrationNote" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "runTimeoutMinutes" INTEGER;

ALTER TABLE "SiteAccount" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SiteScript" ALTER COLUMN "timezone" SET DEFAULT '';

ALTER TABLE "Task" ALTER COLUMN "timezone" SET DEFAULT '';

ALTER TABLE "WechatAccount" ADD COLUMN IF NOT EXISTS "timeOffsetMinutes" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Run_status_notBefore_idx" ON "Run"("status", "notBefore");
CREATE INDEX IF NOT EXISTS "Run_updatedAt_idx" ON "Run"("updatedAt");
CREATE INDEX IF NOT EXISTS "RunLog_ts_idx" ON "RunLog"("ts");
