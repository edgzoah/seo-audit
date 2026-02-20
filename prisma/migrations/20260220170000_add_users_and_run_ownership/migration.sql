CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE "AuditRun"
ADD COLUMN IF NOT EXISTS "ownerUserId" UUID;

INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'system@local', '__SYSTEM_ACCOUNT__', NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;

UPDATE "AuditRun"
SET "ownerUserId" = '00000000-0000-0000-0000-000000000001'
WHERE "ownerUserId" IS NULL;

ALTER TABLE "AuditRun"
ALTER COLUMN "ownerUserId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuditRun_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "AuditRun"
    ADD CONSTRAINT "AuditRun_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditRun_ownerUserId_startedAt_idx" ON "AuditRun" ("ownerUserId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AuditRun_ownerUserId_runId_idx" ON "AuditRun" ("ownerUserId", "runId");
