import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildDiffReport, renderDiffReport, type DiffReport } from "./diff.js";
import { renderReportHtml } from "./html.js";
import { renderReportJson } from "./json.js";
import { renderReportLlm } from "./llm.js";
import { renderReportMarkdown } from "./md.js";
import { assertValidReport, type Report, type ReportFormat } from "./report-schema.js";

export * from "./report-schema.js";
export type { DiffReport } from "./diff.js";

function resolveRunsRoot(baseDir: string): string {
  const custom = process.env.SEO_AUDIT_RUNS_DIR?.trim();
  if (custom) {
    return path.resolve(custom);
  }

  if (process.env.VERCEL === "1") {
    return path.join("/tmp", "runs");
  }

  return path.join(baseDir, "runs");
}

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
  const reportPath = path.join(resolveRunsRoot(baseDir), runId, "report.json");
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
  const html = renderReportHtml(report);

  await writeFile(path.join(runDir, "report.json"), `${json}\n`, "utf-8");
  await writeFile(path.join(runDir, "report.md"), `${markdown}\n`, "utf-8");
  await writeFile(path.join(runDir, "report.llm.txt"), `${llm}\n`, "utf-8");
  await writeFile(path.join(runDir, "report.html"), `${html}\n`, "utf-8");
}

export async function writeRunDiffArtifacts(runDir: string, baselineReport: Report, currentReport: Report): Promise<void> {
  const diff = buildDiffReport(baselineReport, currentReport);
  const json = renderDiffReport(diff, "json");
  const llm = renderDiffReport(diff, "llm");

  await writeFile(path.join(runDir, "diff.json"), `${json}\n`, "utf-8");
  await writeFile(path.join(runDir, "diff.llm.txt"), `${llm}\n`, "utf-8");
}
