import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { validateReport } from "../../src/report/report-schema";
import type { Report } from "./types";

export interface RunSummary {
  runId: string;
  target: string | null;
  coverage: Report["inputs"]["coverage"] | null;
  startedAt: string | null;
  scoreTotal: number | null;
  pagesCrawled: number | null;
  warnings: number | null;
  notices: number | null;
}

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

  const runs = await Promise.all(
    runIds.map(async (runId): Promise<RunSummary> => {
      const report = await readRun(runId);
      if (!report) {
        return {
          runId,
          target: null,
          coverage: null,
          startedAt: null,
          scoreTotal: null,
          pagesCrawled: null,
          warnings: null,
          notices: null,
        };
      }

      return {
        runId,
        target: report.inputs.target,
        coverage: report.inputs.coverage,
        startedAt: report.started_at,
        scoreTotal: report.summary.score_total,
        pagesCrawled: report.summary.pages_crawled,
        warnings: report.summary.warnings,
        notices: report.summary.notices,
      };
    }),
  );

  return runs;
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
