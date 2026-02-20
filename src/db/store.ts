import { buildDiffReport, type DiffReport } from "../report/diff.js";
import { validateReport, type Report } from "../report/report-schema.js";
import { getCliDb } from "./prisma.js";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

function deriveStatus(summary: Report["summary"]): "healthy" | "watch" | "critical" {
  if (summary.errors > 0) return "critical";
  if (summary.warnings > 0) return "watch";
  return "healthy";
}

function deriveDomain(target: string): string | null {
  try {
    return new URL(target).hostname;
  } catch {
    return null;
  }
}

export function isDbWriteEnabled(flag: boolean | undefined): boolean {
  return flag !== false;
}

export async function upsertAuditRun(report: Report): Promise<void> {
  const db = getCliDb();
  const status = deriveStatus(report.summary);
  const ownerUserId = process.env.SEO_AUDIT_DEFAULT_OWNER_USER_ID || SYSTEM_USER_ID;

  await db.unsafe(
    `INSERT INTO "AuditRun" (
      "runId", "ownerUserId", "target", "domain", "coverage", "startedAt", "finishedAt", "scoreTotal", "pagesCrawled", "errors", "warnings", "notices", "status", "summaryJson", "reportJson"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
    )
    ON CONFLICT ("runId") DO UPDATE SET
      "ownerUserId" = EXCLUDED."ownerUserId",
      "target" = EXCLUDED."target",
      "domain" = EXCLUDED."domain",
      "coverage" = EXCLUDED."coverage",
      "startedAt" = EXCLUDED."startedAt",
      "finishedAt" = EXCLUDED."finishedAt",
      "scoreTotal" = EXCLUDED."scoreTotal",
      "pagesCrawled" = EXCLUDED."pagesCrawled",
      "errors" = EXCLUDED."errors",
      "warnings" = EXCLUDED."warnings",
      "notices" = EXCLUDED."notices",
      "status" = EXCLUDED."status",
      "summaryJson" = EXCLUDED."summaryJson",
      "reportJson" = EXCLUDED."reportJson",
      "updatedAt" = NOW()`,
    [
      report.run_id,
      ownerUserId,
      report.inputs.target,
      deriveDomain(report.inputs.target),
      report.inputs.coverage,
      report.started_at,
      report.finished_at,
      report.summary.score_total,
      report.summary.pages_crawled,
      report.summary.errors,
      report.summary.warnings,
      report.summary.notices,
      status,
      db.json(report.summary as unknown as never),
      db.json(report as unknown as never),
    ],
  );
}

export async function getAuditReportByRunId(runId: string): Promise<Report | null> {
  const db = getCliDb();

  const rows = await db.unsafe<Array<{ reportJson: unknown }>>(
    'SELECT "reportJson" FROM "AuditRun" WHERE "runId" = $1 LIMIT 1',
    [runId],
  );

  const row = rows[0];
  if (!row) return null;

  const reportCandidate = (() => {
    if (typeof row.reportJson !== "string") return row.reportJson;
    try {
      return JSON.parse(row.reportJson) as unknown;
    } catch {
      return row.reportJson;
    }
  })();

  if (!validateReport(reportCandidate).valid) {
    throw new Error(`Invalid report payload in DB for run: ${runId}`);
  }

  return reportCandidate as Report;
}

export async function upsertAuditDiff(diff: DiffReport): Promise<void> {
  const db = getCliDb();

  await db.unsafe(
    `INSERT INTO "AuditDiff" ("baselineRunId", "currentRunId", "diffJson")
     VALUES ($1, $2, $3)
     ON CONFLICT ("baselineRunId", "currentRunId")
     DO UPDATE SET "diffJson" = EXCLUDED."diffJson"`,
    [diff.baseline_run_id, diff.current_run_id, db.json(diff as unknown as never)],
  );
}

export async function buildAndUpsertDiff(baseline: Report, current: Report): Promise<DiffReport> {
  const diff = buildDiffReport(baseline, current);
  await upsertAuditDiff(diff);
  return diff;
}
