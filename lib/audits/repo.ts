import { buildDiffReport } from "../../src/report/diff";
import { getDb, ensureDbConfigured } from "../db/prisma";
import { deriveRunStatus, parseReportJson } from "./mappers";
import type { DiffReport, Report } from "./types";

type SqlParam = string | number | boolean | null;

export interface RunSummary {
  run_id: string;
  started_at: string;
  inputs: {
    target: string;
    coverage: Report["inputs"]["coverage"];
  };
  summary: {
    score_total: number;
    pages_crawled: number;
    errors: number;
    warnings: number;
    notices: number;
  };
}

export type RunSort = "newest" | "oldest" | "score_desc" | "score_asc" | "pages_desc" | "warnings_desc";
export type RunStatusFilter = "all" | "healthy" | "watch" | "critical";
export type RunSeverityFilter = "all" | "error" | "warning" | "notice";
export type RunCoverageFilter = "all" | Report["inputs"]["coverage"];

export interface ListRunsPageParams {
  page?: number;
  pageSize?: number;
  status?: RunStatusFilter;
  severity?: RunSeverityFilter;
  coverage?: RunCoverageFilter;
  domain?: string;
  sort?: RunSort;
}

export interface ListRunsPageResult {
  items: RunSummary[];
  total: number;
  page: number;
  pageSize: number;
}

interface AuditRunListRow {
  runId: string;
  startedAt: Date | string;
  target: string;
  coverage: string;
  scoreTotal: number;
  pagesCrawled: number;
  errors: number;
  warnings: number;
  notices: number;
}

function normalizePage(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 25;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function orderByFromSort(sort: RunSort | undefined): string {
  switch (sort) {
    case "oldest":
      return '"startedAt" ASC';
    case "score_desc":
      return '"scoreTotal" DESC';
    case "score_asc":
      return '"scoreTotal" ASC';
    case "pages_desc":
      return '"pagesCrawled" DESC';
    case "warnings_desc":
      return '"warnings" DESC';
    default:
      return '"startedAt" DESC';
  }
}

function toRunSummaryFromRow(row: AuditRunListRow): RunSummary {
  const startedAtIso = row.startedAt instanceof Date ? row.startedAt.toISOString() : new Date(row.startedAt).toISOString();
  return {
    run_id: row.runId,
    started_at: startedAtIso,
    inputs: {
      target: row.target,
      coverage: row.coverage as Report["inputs"]["coverage"],
    },
    summary: {
      score_total: row.scoreTotal,
      pages_crawled: row.pagesCrawled,
      errors: row.errors,
      warnings: row.warnings,
      notices: row.notices,
    },
  };
}

function whereFromParams(params: ListRunsPageParams): { sql: string; values: SqlParam[] } {
  const clauses: string[] = [];
  const values: SqlParam[] = [];

  if (params.status && params.status !== "all") {
    values.push(params.status);
    clauses.push(`"status" = $${values.length}`);
  }

  if (params.coverage && params.coverage !== "all") {
    values.push(params.coverage);
    clauses.push(`"coverage" = $${values.length}`);
  }

  if (params.domain && params.domain !== "all") {
    values.push(params.domain);
    clauses.push(`"domain" = $${values.length}`);
  }

  if (params.severity === "error") {
    clauses.push('"errors" > 0');
  } else if (params.severity === "warning") {
    clauses.push('"warnings" > 0');
  } else if (params.severity === "notice") {
    clauses.push('"notices" > 0');
  }

  if (clauses.length === 0) {
    return { sql: "", values };
  }

  return { sql: `WHERE ${clauses.join(" AND ")}`, values };
}

function logQueryDuration(name: string, startedMs: number): void {
  const elapsed = Date.now() - startedMs;
  if (process.env.LOG_AUDIT_QUERY === "1" || process.env.NODE_ENV !== "production") {
    console.info(`[audits-db] ${name} ${elapsed}ms`);
  }
}

export async function listRunsPage(params: ListRunsPageParams = {}): Promise<ListRunsPageResult> {
  ensureDbConfigured();
  const started = Date.now();
  const db = getDb();

  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const offset = (page - 1) * pageSize;

  const where = whereFromParams(params);
  const orderBy = orderByFromSort(params.sort);

  const listValues = [...where.values, pageSize, offset];
  const limitParam = `$${where.values.length + 1}`;
  const offsetParam = `$${where.values.length + 2}`;

  const rows = await db.unsafe<AuditRunListRow[]>(
    `SELECT "runId", "startedAt", "target", "coverage", "scoreTotal", "pagesCrawled", "errors", "warnings", "notices"
     FROM "AuditRun"
     ${where.sql}
     ORDER BY ${orderBy}
     LIMIT ${limitParam}
     OFFSET ${offsetParam}`,
    listValues,
  );

  const totalRows = await db.unsafe<Array<{ total: number }>>(
    `SELECT COUNT(*)::int AS total
     FROM "AuditRun"
     ${where.sql}`,
    where.values,
  );

  const items = rows.map((row) => toRunSummaryFromRow(row));
  const total = totalRows[0]?.total ?? 0;
  logQueryDuration("listRunsPage", started);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function getRunById(runId: string): Promise<Report | null> {
  ensureDbConfigured();
  const started = Date.now();
  const db = getDb();

  const rows = await db.unsafe<Array<{ runId: string; reportJson: unknown }>>(
    'SELECT "runId", "reportJson" FROM "AuditRun" WHERE "runId" = $1 LIMIT 1',
    [runId],
  );
  logQueryDuration("getRunById", started);

  const row = rows[0];
  if (!row) return null;
  return parseReportJson(row.runId, row.reportJson);
}

export async function listDiffCandidates(limit = 200): Promise<string[]> {
  ensureDbConfigured();
  const started = Date.now();
  const db = getDb();

  const rows = await db.unsafe<Array<{ runId: string }>>(
    'SELECT "runId" FROM "AuditRun" ORDER BY "startedAt" DESC LIMIT $1',
    [limit],
  );

  logQueryDuration("listDiffCandidates", started);
  return rows.map((row) => row.runId);
}

export async function getDiff(baselineId: string, currentId: string): Promise<DiffReport | null> {
  ensureDbConfigured();
  const started = Date.now();
  const db = getDb();

  const stored = await db.unsafe<Array<{ diffJson: DiffReport }>>(
    'SELECT "diffJson" FROM "AuditDiff" WHERE "baselineRunId" = $1 AND "currentRunId" = $2 LIMIT 1',
    [baselineId, currentId],
  );

  if (stored[0]) {
    logQueryDuration("getDiff(stored)", started);
    return stored[0].diffJson;
  }

  const [baseline, current] = await Promise.all([getRunById(baselineId), getRunById(currentId)]);
  if (!baseline || !current) {
    logQueryDuration("getDiff(miss)", started);
    return null;
  }

  const diff = buildDiffReport(baseline, current);
  logQueryDuration("getDiff(built)", started);
  return diff;
}

export async function upsertRunFromReport(report: Report): Promise<void> {
  ensureDbConfigured();
  const db = getDb();

  const status = deriveRunStatus(report.summary);
  const domain = (() => {
    try {
      return new URL(report.inputs.target).hostname;
    } catch {
      return null;
    }
  })();

  await db.unsafe(
    `INSERT INTO "AuditRun" (
      "runId", "target", "domain", "coverage", "startedAt", "finishedAt", "scoreTotal", "pagesCrawled", "errors", "warnings", "notices", "status", "summaryJson", "reportJson"
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb
    )
    ON CONFLICT ("runId") DO UPDATE SET
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
      report.inputs.target,
      domain,
      report.inputs.coverage,
      report.started_at,
      report.finished_at,
      report.summary.score_total,
      report.summary.pages_crawled,
      report.summary.errors,
      report.summary.warnings,
      report.summary.notices,
      status,
      JSON.stringify(report.summary),
      JSON.stringify(report),
    ],
  );
}

export async function upsertDiffReport(diff: DiffReport): Promise<void> {
  ensureDbConfigured();
  const db = getDb();

  await db.unsafe(
    `INSERT INTO "AuditDiff" ("baselineRunId", "currentRunId", "diffJson")
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT ("baselineRunId", "currentRunId")
     DO UPDATE SET "diffJson" = EXCLUDED."diffJson"`,
    [diff.baseline_run_id, diff.current_run_id, JSON.stringify(diff)],
  );
}
