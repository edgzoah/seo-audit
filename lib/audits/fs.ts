import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { buildDiffReport, type DiffReport } from "../../src/report/diff";
import { validateReport } from "../../src/report/report-schema";
import type { Report } from "./types";

/**
 * @deprecated Runtime source of truth moved to PostgreSQL (`lib/audits/repo.ts`).
 * Keep this module only for migration tools and local fallback workflows.
 */
export type RunSummary = Pick<Report, "run_id" | "started_at" | "summary" | "inputs">;

const RUNS_DIR = path.join(process.cwd(), "runs");

function compareRunIdsDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function toRunDirectory(runId: string): string {
  if (!runId.startsWith("run-") || runId.includes("/") || runId.includes("\\")) {
    throw new Error(`Invalid run id: ${runId}`);
  }

  return path.join(RUNS_DIR, runId);
}

export function isReport(x: unknown): x is Report {
  return validateReport(x).valid;
}

async function readReportFile(runId: string): Promise<string> {
  const runDir = toRunDirectory(runId);
  const reportPath = path.join(runDir, "report.json");
  return readFile(reportPath, "utf-8");
}

async function readDiffFile(runId: string): Promise<string> {
  const runDir = toRunDirectory(runId);
  const diffPath = path.join(runDir, "diff.json");
  return readFile(diffPath, "utf-8");
}

export async function loadReport(runId: string): Promise<Report>;
export async function loadReport(runId: string, opts: { raw: true }): Promise<string>;
export async function loadReport(runId: string, opts?: { raw?: true }): Promise<Report | string> {
  const raw = await readReportFile(runId);
  if (opts?.raw) {
    return raw;
  }

  const parsed: unknown = JSON.parse(raw);
  if (!isReport(parsed)) {
    throw new Error(`Invalid report schema for run: ${runId}`);
  }

  return parsed;
}

export async function readRun(runId: string): Promise<Report | null> {
  try {
    const report = await loadReport(runId);
    return report;
  } catch {
    return null;
  }
}

export async function listRuns(limit = 30): Promise<RunSummary[]> {
  const entries = await readdir(RUNS_DIR, { withFileTypes: true });
  const runIds = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort(compareRunIdsDesc)
    .slice(0, limit);

  const reports = await Promise.all(runIds.map((runId) => readRun(runId)));
  return reports.filter((report): report is Report => report !== null);
}

export async function listDiffCandidates(): Promise<string[]> {
  const entries = await readdir(RUNS_DIR, { withFileTypes: true });
  const runIds = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort(compareRunIdsDesc);

  const withReports = await Promise.all(
    runIds.map(async (runId) => {
      const report = await readRun(runId);
      return report ? runId : null;
    }),
  );

  return withReports.filter((runId): runId is string => runId !== null);
}

function isDiffReport(value: unknown): value is DiffReport {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DiffReport>;
  return (
    typeof candidate.baseline_run_id === "string" &&
    typeof candidate.current_run_id === "string" &&
    typeof candidate.score_total_delta === "number" &&
    typeof candidate.score_by_category_delta === "object" &&
    Array.isArray(candidate.resolved_issues) &&
    Array.isArray(candidate.new_issues) &&
    Array.isArray(candidate.regressed_issues)
  );
}

export async function readDiff(baselineId: string, currentId: string): Promise<DiffReport | null> {
  try {
    const raw = await readDiffFile(currentId);
    const parsed: unknown = JSON.parse(raw);
    if (isDiffReport(parsed) && parsed.baseline_run_id === baselineId && parsed.current_run_id === currentId) {
      return parsed;
    }
  } catch {
    // fall through to dynamic diff build
  }

  const baseline = await readRun(baselineId);
  const current = await readRun(currentId);
  if (!baseline || !current) {
    return null;
  }

  return buildDiffReport(baseline, current);
}
