import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDiffReport, renderDiffReport, type DiffReport } from "./diff.js";
import { renderReportJson } from "./json.js";
import { renderReportLlm } from "./llm.js";
import { renderReportMarkdown } from "./md.js";
import { assertValidReport, type Report, type ReportFormat } from "./report-schema.js";

export * from "./report-schema.js";
export type { DiffReport } from "./diff.js";

export function renderReport(report: Report, format: ReportFormat): string {
  switch (format) {
    case "json":
      return renderReportJson(report);
    case "md":
      return renderReportMarkdown(report);
    case "llm":
      return renderReportLlm(report);
    default: {
      const unreachable: never = format;
      throw new Error(`Unsupported report format: ${String(unreachable)}`);
    }
  }
}

export async function loadReportFromRun(runId: string, baseDir: string = process.cwd()): Promise<Report> {
  const reportPath = path.join(baseDir, "runs", runId, "report.json");
  const raw = await readFile(reportPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  assertValidReport(parsed);
  return parsed;
}

export async function loadDiffFromRuns(
  baselineRunId: string,
  currentRunId: string,
  baseDir: string = process.cwd(),
): Promise<DiffReport> {
  const [baselineReport, currentReport] = await Promise.all([
    loadReportFromRun(baselineRunId, baseDir),
    loadReportFromRun(currentRunId, baseDir),
  ]);

  return buildDiffReport(baselineReport, currentReport);
}

export function renderDiff(diff: DiffReport, format: ReportFormat): string {
  return renderDiffReport(diff, format);
}

export async function writeRunReports(runDir: string, report: Report): Promise<void> {
  const json = renderReportJson(report);
  const markdown = renderReportMarkdown(report);
  const llm = renderReportLlm(report);

  await writeFile(path.join(runDir, "report.json"), `${json}\n`, "utf-8");
  await writeFile(path.join(runDir, "report.md"), `${markdown}\n`, "utf-8");
  await writeFile(path.join(runDir, "report.llm.txt"), `${llm}\n`, "utf-8");
}
