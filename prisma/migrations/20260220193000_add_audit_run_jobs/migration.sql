CREATE TYPE "AuditJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE "AuditRunJob" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ownerUserId" UUID NOT NULL,
  "status" "AuditJobStatus" NOT NULL,
  "runId" TEXT,
  "error" TEXT,
  "logsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AuditRunJob_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AuditRunJob_ownerUserId_createdAt_idx" ON "AuditRunJob" ("ownerUserId", "createdAt" DESC);
