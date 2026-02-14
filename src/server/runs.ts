import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Report } from "../report/report-schema.js";

export interface RunListItem {
  runId: string;
  target?: string;
  scoreTotal?: number;
  pagesCrawled?: number;
  warnings?: number;
  notices?: number;
}

const RUNS_DIR = path.join(process.cwd(), "runs");

async function readReportJson(runId: string): Promise<Report> {
  const reportPath = path.join(RUNS_DIR, runId, "report.json");
  const raw = await readFile(reportPath, "utf-8");
  return JSON.parse(raw) as Report;
}

export async function listRuns(limit = 30): Promise<RunListItem[]> {
  const entries = await readdir(RUNS_DIR, { withFileTypes: true });
  const runIds = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);

  const items = await Promise.all(
    runIds.map(async (runId): Promise<RunListItem> => {
      try {
        const report = await readReportJson(runId);
        return {
          runId,
          target: report.inputs.target,
          scoreTotal: report.summary.score_total,
          pagesCrawled: report.summary.pages_crawled,
          warnings: report.summary.warnings,
          notices: report.summary.notices,
        };
      } catch {
        return { runId };
      }
    }),
  );

  return items;
}

export async function getReport(runId: string): Promise<Report | null> {
  try {
    return await readReportJson(runId);
  } catch {
    return null;
  }
}
