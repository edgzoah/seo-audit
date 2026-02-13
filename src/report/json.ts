import type { Report } from "./report-schema.js";

export function renderReportJson(report: Report): string {
  return JSON.stringify(report, null, 2);
}
