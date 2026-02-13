import type { Report } from "./report-schema.js";

export function renderReportLlm(report: Report): string {
  const categories = Array.from(new Set(report.issues.map((issue) => issue.category))).sort((a, b) =>
    a.localeCompare(b, "en"),
  );

  const lines: string[] = [];

  lines.push("[HEADER]");
  lines.push(`run_id=${report.run_id}`);
  lines.push(`target=${report.inputs.target}`);
  lines.push(`coverage=${report.inputs.coverage}`);
  lines.push(`pages=${report.summary.pages_crawled}`);
  lines.push(`score_total=${report.summary.score_total}`);
  lines.push("");

  lines.push("[SCORES]");
  if (Object.keys(report.summary.score_by_category).length === 0) {
    lines.push("(placeholder)");
  } else {
    for (const [category, score] of Object.entries(report.summary.score_by_category)) {
      lines.push(`${category}=${score}`);
    }
  }
  lines.push("");

  lines.push("[ISSUES_BY_CATEGORY]");
  if (report.issues.length === 0) {
    lines.push("none");
    return lines.join("\n");
  }

  for (const category of categories) {
    lines.push(`category=${category}`);
    for (const issue of report.issues.filter((current) => current.category === category)) {
      lines.push(`- id=${issue.id} severity=${issue.severity} rank=${issue.rank} affected=${issue.affected_urls.length}`);
      if (issue.evidence[0]) {
        lines.push(`  evidence=${issue.evidence[0].message}`);
      }
      lines.push(`  recommendation=${issue.recommendation}`);
    }
  }

  return lines.join("\n");
}
