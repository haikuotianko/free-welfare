-- Per-account environment variable overrides for an application binding.
ALTER TABLE "SiteAccount"
ADD COLUMN "envVars" JSONB NOT NULL DEFAULT '{}';
