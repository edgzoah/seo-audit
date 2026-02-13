import type { Issue, IssueSeverity, Report, ReportFormat } from "./report-schema.js";

const SEVERITY_SCORE: Record<IssueSeverity, number> = {
  notice: 1,
  warning: 2,
  error: 3,
};

export interface IssueDelta {
  id: string;
  baseline_count: number;
  current_count: number;
  baseline_max_severity: IssueSeverity;
  current_max_severity: IssueSeverity;
}

export interface DiffReport {
  baseline_run_id: string;
  current_run_id: string;
  score_total_delta: number;
  score_by_category_delta: Record<string, number>;
  resolved_issues: string[];
  new_issues: string[];
  regressed_issues: IssueDelta[];
}

interface IssueAggregate {
  count: number;
  maxSeverity: IssueSeverity;
}

function aggregateIssuesById(issues: Issue[]): Map<string, IssueAggregate> {
  const map = new Map<string, IssueAggregate>();

  for (const issue of issues) {
    const existing = map.get(issue.id);
    if (!existing) {
      map.set(issue.id, {
        count: issue.affected_urls.length,
        maxSeverity: issue.severity,
      });
      continue;
    }

    existing.count += issue.affected_urls.length;
    if (SEVERITY_SCORE[issue.severity] > SEVERITY_SCORE[existing.maxSeverity]) {
      existing.maxSeverity = issue.severity;
    }
  }

  return map;
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "en");
}

export function buildDiffReport(baseline: Report, current: Report): DiffReport {
  const baselineIssues = aggregateIssuesById(baseline.issues);
  const currentIssues = aggregateIssuesById(current.issues);

  const allIds = new Set<string>([...baselineIssues.keys(), ...currentIssues.keys()]);
  const sortedIds = Array.from(allIds).sort(compareStrings);

  const resolvedIssues: string[] = [];
  const newIssues: string[] = [];
  const regressedIssues: IssueDelta[] = [];

  for (const id of sortedIds) {
    const baselineIssue = baselineIssues.get(id);
    const currentIssue = currentIssues.get(id);

    if (baselineIssue && !currentIssue) {
      resolvedIssues.push(id);
      continue;
    }

    if (!baselineIssue && currentIssue) {
      newIssues.push(id);
      continue;
    }

    if (!baselineIssue || !currentIssue) {
      continue;
    }

    const worsenedSeverity = SEVERITY_SCORE[currentIssue.maxSeverity] > SEVERITY_SCORE[baselineIssue.maxSeverity];
    const worsenedCount = currentIssue.count > baselineIssue.count;

    if (worsenedSeverity || worsenedCount) {
      regressedIssues.push({
        id,
        baseline_count: baselineIssue.count,
        current_count: currentIssue.count,
        baseline_max_severity: baselineIssue.maxSeverity,
        current_max_severity: currentIssue.maxSeverity,
      });
    }
  }

  const categoryKeys = new Set<string>([
    ...Object.keys(baseline.summary.score_by_category),
    ...Object.keys(current.summary.score_by_category),
  ]);
  const sortedCategories = Array.from(categoryKeys).sort(compareStrings);

  const scoreByCategoryDelta: Record<string, number> = {};
  for (const category of sortedCategories) {
    const baselineScore = baseline.summary.score_by_category[category] ?? 0;
    const currentScore = current.summary.score_by_category[category] ?? 0;
    scoreByCategoryDelta[category] = currentScore - baselineScore;
  }

  return {
    baseline_run_id: baseline.run_id,
    current_run_id: current.run_id,
    score_total_delta: current.summary.score_total - baseline.summary.score_total,
    score_by_category_delta: scoreByCategoryDelta,
    resolved_issues: resolvedIssues,
    new_issues: newIssues,
    regressed_issues: regressedIssues,
  };
}

function renderDiffMarkdown(diff: DiffReport): string {
  const lines: string[] = [];

  lines.push("# SEO Audit Diff");
  lines.push("");
  lines.push(`- Baseline run: ${diff.baseline_run_id}`);
  lines.push(`- Current run: ${diff.current_run_id}`);
  lines.push(`- Score total delta: ${diff.score_total_delta}`);
  lines.push("");
  lines.push("## Score Delta By Category");
  lines.push("");

  for (const [category, delta] of Object.entries(diff.score_by_category_delta)) {
    lines.push(`- ${category}: ${delta}`);
  }

  if (Object.keys(diff.score_by_category_delta).length === 0) {
    lines.push("- (no category deltas)");
  }

  lines.push("");
  lines.push("## Issues");
  lines.push("");
  lines.push(`- Resolved: ${diff.resolved_issues.join(", ") || "none"}`);
  lines.push(`- New: ${diff.new_issues.join(", ") || "none"}`);

  if (diff.regressed_issues.length === 0) {
    lines.push("- Regressed: none");
  } else {
    lines.push("- Regressed:");
    for (const issue of diff.regressed_issues) {
      lines.push(
        `  - ${issue.id} (count ${issue.baseline_count}->${issue.current_count}, severity ${issue.baseline_max_severity}->${issue.current_max_severity})`,
      );
    }
  }

  return lines.join("\n");
}

function renderDiffLlm(diff: DiffReport): string {
  const lines: string[] = [];

  lines.push("[DIFF_HEADER]");
  lines.push(`baseline_run_id=${diff.baseline_run_id}`);
  lines.push(`current_run_id=${diff.current_run_id}`);
  lines.push(`score_total_delta=${diff.score_total_delta}`);
  lines.push("");
  lines.push("[CATEGORY_DELTAS]");

  if (Object.keys(diff.score_by_category_delta).length === 0) {
    lines.push("none");
  } else {
    for (const [category, delta] of Object.entries(diff.score_by_category_delta)) {
      lines.push(`${category}=${delta}`);
    }
  }

  lines.push("");
  lines.push("[ISSUE_DELTAS]");
  lines.push(`resolved=${diff.resolved_issues.join(",") || "none"}`);
  lines.push(`new=${diff.new_issues.join(",") || "none"}`);

  if (diff.regressed_issues.length === 0) {
    lines.push("regressed=none");
  } else {
    for (const issue of diff.regressed_issues) {
      lines.push(
        `regressed=${issue.id}|count=${issue.baseline_count}->${issue.current_count}|severity=${issue.baseline_max_severity}->${issue.current_max_severity}`,
      );
    }
  }

  return lines.join("\n");
}

export function renderDiffReport(diff: DiffReport, format: ReportFormat): string {
  switch (format) {
    case "json":
      return JSON.stringify(diff, null, 2);
    case "md":
      return renderDiffMarkdown(diff);
    case "llm":
      return renderDiffLlm(diff);
    default: {
      const unreachable: never = format;
      throw new Error(`Unsupported diff format: ${String(unreachable)}`);
    }
  }
}
