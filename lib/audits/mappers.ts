import { validateReport } from "../../src/report/report-schema";
import type { Report } from "./types";

export function deriveDomain(target: string): string | null {
  try {
    return new URL(target).hostname;
  } catch {
    return null;
  }
}

export function deriveRunStatus(summary: Report["summary"]): "healthy" | "watch" | "critical" {
  if (summary.errors > 0) return "critical";
  if (summary.warnings > 0) return "watch";
  return "healthy";
}

export function parseReportJson(runId: string, json: unknown): Report {
  if (!validateReport(json).valid) {
    throw new Error(`Invalid report payload in DB for run: ${runId}`);
  }

  return json as Report;
}
