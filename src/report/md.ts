import type { Issue, PageExtract, Report } from "./report-schema.js";

function severityLabel(issue: Issue): string {
  return issue.severity.toUpperCase();
}

function findFocusPage(report: Report): PageExtract | null {
  const focusUrl = report.summary.focus?.primary_url;
  if (!focusUrl || !report.page_extracts) {
    return null;
  }
  return report.page_extracts.find((page) => page.final_url === focusUrl || page.url === focusUrl) ?? null;
}

function groupNextActions(report: Report): { quickWins: string[]; structural: string[] } {
  const quickWins = report.issues
    .filter((issue) => ["serp", "a11y", "internal_links", "content"].includes(issue.category))
    .slice(0, 8)
    .map((issue) => issue.title);
  const structural = report.issues
    .filter((issue) => ["schema_quality", "indexation_conflicts", "content_quality", "technical"].includes(issue.category))
    .slice(0, 8)
    .map((issue) => issue.title);

  return { quickWins, structural };
}

export function renderReportMarkdown(report: Report): string {
  const lines: string[] = [];
  const focusPage = findFocusPage(report);
  const focusSummary = report.summary.focus;
  const actions = groupNextActions(report);
  const internalLinkPlan = report.proposed_packs?.internal_link_plan?.length
    ? report.proposed_packs.internal_link_plan
    : (report.internal_link_plan ?? []);

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

  lines.push("## Focus Deep Dive");
  lines.push("");
  if (!focusSummary || !focusPage) {
    lines.push("- No focus page configured or extracted.");
  } else {
    const h1 = focusPage.headings_outline.find((item) => item.level === 1)?.text ?? "(missing)";
    const mismatchIssue = report.issues.find((issue) => issue.id === "title_h1_mismatch" && issue.affected_urls.includes(focusPage.url));
    lines.push(`- Focus URL: ${focusSummary.primary_url}`);
    lines.push(`- Title: ${focusPage.titleText || "(missing)"}`);
    lines.push(`- H1: ${h1}`);
    lines.push(`- Title/H1 mismatch: ${mismatchIssue ? "yes" : "no"}`);
    lines.push(`- Top headings: ${focusPage.headings_outline.slice(0, 5).map((item) => item.text).join(" | ") || "(none)"}`);
    lines.push(`- wordCountMain: ${focusPage.wordCountMain}`);
    lines.push(`- Focus inlinks: ${focusSummary.focusInlinksCount ?? 0}`);
    lines.push(`- Top inlink sources: ${(focusSummary.topInlinkSourcesToFocus ?? []).slice(0, 10).join(", ") || "(none)"}`);
    lines.push(
      `- Top anchors: ${(focusSummary.focusAnchorQuality?.topAnchors ?? [])
        .slice(0, 10)
        .map((item) => `${item.anchor || "(empty)"} (${item.count})`)
        .join(", ") || "(none)"}`,
    );
    lines.push("- Next actions / Quick wins:");
    for (const item of actions.quickWins) {
      lines.push(`  - ${item}`);
    }
    lines.push("- Next actions / Structural:");
    for (const item of actions.structural) {
      lines.push(`  - ${item}`);
    }
  }
  lines.push("");

  lines.push("## Internal Link Graph Summary");
  lines.push("");
  if (!report.summary.internal_links) {
    lines.push("- Internal link graph metrics unavailable.");
  } else {
    lines.push(`- Orphan pages: ${report.summary.internal_links.orphanPagesCount}`);
    lines.push(`- Near-orphan pages: ${report.summary.internal_links.nearOrphanPagesCount}`);
    lines.push(`- Nav-likely inlinks: ${report.summary.internal_links.navLikelyInlinksPercent}%`);
    lines.push(
      `- Top anchors: ${report.summary.internal_links.topAnchors
        .map((item) => `${item.anchor || "(empty)"} (${item.count})`)
        .join(", ") || "(none)"}`,
    );
  }
  lines.push("");

  lines.push("## Internal Link Plan");
  lines.push("");
  if (internalLinkPlan.length === 0) {
    lines.push("- No internal link recommendations generated.");
  } else {
    for (const item of internalLinkPlan) {
      lines.push(`- Source: ${item.sourceUrl}`);
      lines.push(`  - Anchor: ${item.suggestedAnchor}`);
      lines.push(`  - Context: ${item.suggestedSentenceContext}`);
    }
  }
  lines.push("");

  lines.push("## SERP Quality Summary");
  lines.push("");
  lines.push(`- title_h1_mismatch: ${report.issues.filter((item) => item.id === "title_h1_mismatch").length}`);
  lines.push(`- meta_description_missing: ${report.issues.filter((item) => item.id === "meta_description_missing").length}`);
  lines.push(`- meta_description_duplicate: ${report.issues.filter((item) => item.id === "meta_description_duplicate").length}`);
  lines.push(`- meta_description_spammy: ${report.issues.filter((item) => item.id === "meta_description_spammy").length}`);
  lines.push("");

  lines.push("## Schema Quality Summary");
  lines.push("");
  lines.push(`- breadcrumb_schema_invalid: ${report.issues.filter((item) => item.id === "breadcrumb_schema_invalid").length}`);
  lines.push(`- org_schema_incomplete: ${report.issues.filter((item) => item.id === "org_schema_incomplete").length}`);
  lines.push("");

  lines.push("## Performance Summary");
  lines.push("");
  if (!report.summary.performanceFocus && !report.summary.performanceHome) {
    lines.push("- Performance: not measured");
  } else {
    const focusPerf = report.summary.performanceFocus;
    const homePerf = report.summary.performanceHome;
    if (focusPerf) {
      lines.push(
        `- Focus: status=${focusPerf.status}, LCP=${focusPerf.lcpMs ?? "n/a"}, INP=${focusPerf.inpMs ?? "n/a"}, CLS=${focusPerf.cls ?? "n/a"}, score=${focusPerf.scorePerf ?? "n/a"}`,
      );
    }
    if (homePerf) {
      lines.push(
        `- Home: status=${homePerf.status}, LCP=${homePerf.lcpMs ?? "n/a"}, INP=${homePerf.inpMs ?? "n/a"}, CLS=${homePerf.cls ?? "n/a"}, score=${homePerf.scorePerf ?? "n/a"}`,
      );
    }
  }
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
