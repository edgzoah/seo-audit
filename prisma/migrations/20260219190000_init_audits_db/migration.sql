CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "AuditRunStatus" AS ENUM ('healthy', 'watch', 'critical');

CREATE TABLE "AuditRun" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId" TEXT NOT NULL UNIQUE,
  "target" TEXT NOT NULL,
  "domain" TEXT,
  "coverage" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ NOT NULL,
  "finishedAt" TIMESTAMPTZ NOT NULL,
  "scoreTotal" DOUBLE PRECISION NOT NULL,
  "pagesCrawled" INTEGER NOT NULL,
  "errors" INTEGER NOT NULL,
  "warnings" INTEGER NOT NULL,
  "notices" INTEGER NOT NULL,
  "status" "AuditRunStatus" NOT NULL,
  "summaryJson" JSONB NOT NULL,
  "reportJson" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "AuditRun_startedAt_idx" ON "AuditRun" ("startedAt" DESC);
CREATE INDEX "AuditRun_status_startedAt_idx" ON "AuditRun" ("status", "startedAt" DESC);
CREATE INDEX "AuditRun_coverage_startedAt_idx" ON "AuditRun" ("coverage", "startedAt" DESC);
CREATE INDEX "AuditRun_domain_startedAt_idx" ON "AuditRun" ("domain", "startedAt" DESC);
CREATE INDEX "AuditRun_scoreTotal_idx" ON "AuditRun" ("scoreTotal" DESC);
CREATE INDEX "AuditRun_target_idx" ON "AuditRun" ("target");

CREATE TABLE "AuditDiff" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "baselineRunId" TEXT NOT NULL,
  "currentRunId" TEXT NOT NULL,
  "diffJson" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("baselineRunId", "currentRunId")
);

CREATE INDEX "AuditDiff_currentRunId_idx" ON "AuditDiff" ("currentRunId");
