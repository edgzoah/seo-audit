import { buildDiffReport } from "../src/report/diff";
import type { Issue, Report } from "../src/report/report-schema";
import { setRunDisplayName, upsertDiffReport, upsertRunFromReport } from "../lib/audits/repo";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

function makeAffectedUrls(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, idx) => `${base}/page-${idx + 1}`);
}

function makeIssue(partial: Partial<Issue> & Pick<Issue, "id" | "category" | "severity">): Issue {
  return {
    id: partial.id,
    category: partial.category,
    severity: partial.severity,
    rank: partial.rank ?? 1,
    title: partial.title ?? partial.id,
    description: partial.description ?? "Demo issue for compare charts",
    affected_urls: partial.affected_urls ?? [],
    evidence: partial.evidence ?? [],
    recommendation: partial.recommendation ?? "Address this issue to improve SEO quality.",
    tags: partial.tags ?? ["demo"],
  };
}

function makeInputs(target: string, baselineRunId: string | null) {
  return {
    target_type: "url" as const,
    target,
    coverage: "surface" as const,
    max_pages: 20,
    crawl_depth: 3,
    include_patterns: [],
    exclude_patterns: [],
    allowed_domains: [new URL(target).hostname],
    respect_robots: true,
    rendering_mode: "static_html" as const,
    user_agent: "seo-audit-demo-bot",
    timeout_ms: 15000,
    locale: {
      language: "pl",
      country: "PL",
    },
    report_format: "json" as const,
    llm_enabled: false,
    baseline_run_id: baselineRunId,
    brief: {
      text: "Demo compare run for dashboard visualization",
      focus: {
        primary_url: `${target}/uslugi/seo`,
        primary_keyword: "audyt seo",
        goal: "Lead generation",
        current_position: null,
        secondary_urls: [],
      },
      constraints: [],
      weighting_overrides: {
        boost_rules: [],
        boost_categories: [],
      },
    },
  };
}

function makePages(target: string) {
  return [
    `${target}/`,
    `${target}/oferta`,
    `${target}/blog`,
    `${target}/kontakt`,
    `${target}/uslugi/seo`,
    `${target}/uslugi/content`,
    `${target}/case-study`,
    `${target}/o-nas`,
  ].map((url) => ({
    url,
    final_url: url,
    status: 200,
    title: "Demo Page",
    canonical: url,
  }));
}

async function seed(): Promise<void> {
  const target = "https://demo-seo.local";
  const baselineRunId = "compare-demo-baseline";
  const currentRunId = "compare-demo-current";

  const baselineIssues: Issue[] = [
    makeIssue({ id: "missing_h1", category: "on_page", severity: "warning", affected_urls: makeAffectedUrls(target, 4) }),
    makeIssue({ id: "duplicate_title", category: "metadata", severity: "warning", affected_urls: makeAffectedUrls(target, 6) }),
    makeIssue({ id: "broken_internal_links", category: "internal_links", severity: "error", affected_urls: makeAffectedUrls(target, 2) }),
    makeIssue({ id: "slow_lcp", category: "performance", severity: "warning", affected_urls: makeAffectedUrls(target, 3) }),
    makeIssue({ id: "thin_content", category: "content", severity: "notice", affected_urls: makeAffectedUrls(target, 5) }),
    makeIssue({ id: "missing_alt", category: "accessibility", severity: "notice", affected_urls: makeAffectedUrls(target, 7) }),
    makeIssue({ id: "low_inlink_depth", category: "internal_links", severity: "notice", affected_urls: makeAffectedUrls(target, 1) }),
  ];

  const currentIssues: Issue[] = [
    makeIssue({ id: "duplicate_title", category: "metadata", severity: "error", affected_urls: makeAffectedUrls(target, 9) }),
    makeIssue({ id: "broken_internal_links", category: "internal_links", severity: "error", affected_urls: makeAffectedUrls(target, 1) }),
    makeIssue({ id: "slow_lcp", category: "performance", severity: "warning", affected_urls: makeAffectedUrls(target, 5) }),
    makeIssue({ id: "missing_alt", category: "accessibility", severity: "warning", affected_urls: makeAffectedUrls(target, 12) }),
    makeIssue({ id: "low_inlink_depth", category: "internal_links", severity: "notice", affected_urls: makeAffectedUrls(target, 4) }),
    makeIssue({ id: "cls_instability", category: "performance", severity: "warning", affected_urls: makeAffectedUrls(target, 3) }),
    makeIssue({ id: "canonical_mismatch", category: "technical", severity: "error", affected_urls: makeAffectedUrls(target, 2) }),
  ];

  const baselineReport: Report = {
    run_id: baselineRunId,
    started_at: "2026-02-19T10:00:00.000Z",
    finished_at: "2026-02-19T10:08:00.000Z",
    inputs: makeInputs(target, null),
    summary: {
      score_total: 78,
      score_by_category: {
        technical: 82,
        metadata: 76,
        content: 84,
        performance: 74,
        internal_links: 80,
        accessibility: 72,
        schema: 88,
        security: 91,
      },
      pages_crawled: 8,
      errors: 2,
      warnings: 13,
      notices: 13,
    },
    issues: baselineIssues,
    pages: makePages(target),
  };

  const currentReport: Report = {
    run_id: currentRunId,
    started_at: "2026-02-20T10:00:00.000Z",
    finished_at: "2026-02-20T10:09:00.000Z",
    inputs: makeInputs(target, baselineRunId),
    summary: {
      score_total: 71,
      score_by_category: {
        technical: 69,
        metadata: 68,
        content: 87,
        performance: 66,
        internal_links: 71,
        accessibility: 62,
        schema: 90,
        security: 93,
      },
      pages_crawled: 8,
      errors: 12,
      warnings: 20,
      notices: 6,
    },
    issues: currentIssues,
    pages: makePages(target),
  };

  await upsertRunFromReport(SYSTEM_USER_ID, baselineReport);
  await upsertRunFromReport(SYSTEM_USER_ID, currentReport);

  await setRunDisplayName(SYSTEM_USER_ID, baselineRunId, "Demo Baseline (Charts)");
  await setRunDisplayName(SYSTEM_USER_ID, currentRunId, "Demo Current (Charts)");

  const diff = buildDiffReport(baselineReport, currentReport);
  await upsertDiffReport(SYSTEM_USER_ID, diff);

  console.info("Seeded compare demo runs:");
  console.info(`- ${baselineRunId}`);
  console.info(`- ${currentRunId}`);
  console.info(`- score_total_delta: ${diff.score_total_delta.toFixed(1)}`);
  console.info(`- resolved/new/regressed: ${diff.resolved_issues.length}/${diff.new_issues.length}/${diff.regressed_issues.length}`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
