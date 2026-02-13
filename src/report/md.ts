import type { Issue, Report } from "./report-schema.js";

function severityLabel(issue: Issue): string {
  return issue.severity.toUpperCase();
}

export function renderReportMarkdown(report: Report): string {
  const lines: string[] = [];

  lines.push("# SEO Audit Report");
  lines.push("");
  lines.push(`- Run ID: ${report.run_id}`);
  lines.push(`- Target: ${report.inputs.target}`);
  lines.push(`- Coverage: ${report.inputs.coverage}`);
  lines.push(`- Started: ${report.started_at}`);
  lines.push(`- Finished: ${report.finished_at}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Score total: ${report.summary.score_total}`);
  lines.push(`- Pages crawled: ${report.summary.pages_crawled}`);
  lines.push(`- Errors: ${report.summary.errors}`);
  lines.push(`- Warnings: ${report.summary.warnings}`);
  lines.push(`- Notices: ${report.summary.notices}`);
  lines.push("");
  lines.push("## Scores By Category");
  lines.push("");

  for (const [category, score] of Object.entries(report.summary.score_by_category)) {
    lines.push(`- ${category}: ${score}`);
  }

  if (Object.keys(report.summary.score_by_category).length === 0) {
    lines.push("- (no category scores)");
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");

  if (report.issues.length === 0) {
    lines.push("No issues found.");
  } else {
    for (const issue of report.issues) {
      lines.push(`### ${issue.id} (${severityLabel(issue)}, rank ${issue.rank})`);
      lines.push("");
      lines.push(`- Category: ${issue.category}`);
      lines.push(`- Title: ${issue.title}`);
      lines.push(`- Description: ${issue.description}`);
      lines.push(`- Affected URLs: ${issue.affected_urls.join(", ")}`);
      lines.push(`- Recommendation: ${issue.recommendation}`);

      if (issue.evidence.length > 0) {
        lines.push("- Evidence:");
        for (const evidence of issue.evidence) {
          lines.push(`  - ${evidence.message}`);
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
